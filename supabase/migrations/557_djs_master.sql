-- ============================================================================
-- Migration 557: DJ 마스터 + 별칭 매핑
-- 날짜: 2026-08-26
-- 설명:
--   클럽 타임테이블(DJ 라인업) 기능의 기반. DJ를 문자열이 아니라 엔티티로 관리한다.
--
-- 왜 별칭 테이블이 필요한가:
--   포스터마다 같은 DJ의 표기가 다르다. "BERMUDA DJ" / "DJ BERMUDA" / "버뮤다".
--   문자열로 저장하면 6개월 뒤 한 DJ가 12개 엔티티로 쪼개진다.
--   dj_aliases.normalized 에 UNIQUE 를 걸어 DB가 분열을 물리적으로 막는다.
--
-- normalized 규약 (src/lib/lineups/djName.ts 의 normalizeDjName 과 반드시 일치):
--   소문자화 → 영숫자/한글만 남김 → 선행·후행 "dj" 제거
--   "DJ BERMUDA" → "bermuda", "BERMUDA DJ" → "bermuda"
--   한글 "버뮤다" → "버뮤다" (영문과 자동 매칭 불가 → 운영자가 Admin에서 수동 연결)
--
-- 후속: 558(라인업), 559(RLS+RPC), 560(수집 소스), 561(초안), 562(실행로그+cron)
-- ============================================================================

-- ============================================================================
-- 1) djs — DJ 마스터
-- ============================================================================
CREATE TABLE IF NOT EXISTS djs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 정본 표시명. 포스터 표기가 아니라 대표 이름 1개 (예: "ZESTURE")
  display_name TEXT NOT NULL,

  -- URL 세그먼트 (/dj/{slug}). 소문자 영숫자 + 하이픈
  slug TEXT NOT NULL UNIQUE,

  -- 핸들만 저장 (clubs.instagram / users.instagram 과 동일 규약, Migration 203)
  -- 렌더 시 https://instagram.com/{handle} 로 조립
  instagram TEXT,
  soundcloud_url TEXT,

  bio TEXT,
  photo_url TEXT,

  -- 특정 클럽 전속(레지던트). "BERMUDA DJ" 같은 클럽 자체 DJ 표기용
  resident_club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

  -- 테스트 데이터 숨김 (프로젝트 SSOT: is_test 컬럼)
  is_test BOOLEAN NOT NULL DEFAULT false,

  -- 소프트 삭제. 플레이 이력이 남으므로 하드 삭제하지 않는다
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_djs_slug ON djs(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_djs_resident ON djs(resident_club_id) WHERE deleted_at IS NULL;
-- Admin DJ 검색 (display_name ilike)
CREATE INDEX IF NOT EXISTS idx_djs_display_name ON djs(lower(display_name)) WHERE deleted_at IS NULL;

-- ============================================================================
-- 2) dj_aliases — 포스터에 등장할 수 있는 모든 표기 → DJ 1건 매핑
-- ============================================================================
CREATE TABLE IF NOT EXISTS dj_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dj_id UUID NOT NULL REFERENCES djs(id) ON DELETE CASCADE,

  -- 원본 표기 그대로 (예: "DJ BERMUDA") — 어떤 표기에서 왔는지 감사용
  alias TEXT NOT NULL,

  -- 매칭 키. 이 값이 같으면 같은 DJ다.
  -- UNIQUE 라서 한 표기가 두 DJ에 붙는 것을 DB가 거부한다 = 분열 방지의 정본
  normalized TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(normalized)
);

CREATE INDEX IF NOT EXISTS idx_dj_aliases_dj ON dj_aliases(dj_id);
-- Admin 별칭 검색 (alias ilike)
CREATE INDEX IF NOT EXISTS idx_dj_aliases_alias ON dj_aliases(lower(alias));

-- ============================================================================
-- 3) updated_at 자동 갱신 — 001_initial_schema.sql 의 공용 함수 재사용
-- ============================================================================
DROP TRIGGER IF EXISTS djs_updated_at ON djs;
CREATE TRIGGER djs_updated_at
  BEFORE UPDATE ON djs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4) 코멘트
-- ============================================================================
COMMENT ON TABLE djs IS 'DJ 마스터. 라인업의 dj_id 참조 대상. 삭제는 deleted_at 소프트 삭제만.';
COMMENT ON TABLE dj_aliases IS '포스터 표기 → DJ 매핑. normalized UNIQUE 가 DJ 엔티티 분열을 막는다.';
COMMENT ON COLUMN djs.instagram IS '핸들만 저장 (@ 없이). Migration 203 clubs.instagram 과 동일 규약.';
COMMENT ON COLUMN dj_aliases.normalized IS 'src/lib/lineups/djName.ts normalizeDjName() 결과와 반드시 일치해야 함.';
