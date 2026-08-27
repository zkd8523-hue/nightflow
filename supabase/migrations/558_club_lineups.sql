-- ============================================================================
-- Migration 558: 클럽 타임테이블(라인업) + 셋 슬롯
-- 날짜: 2026-08-26
-- 선행: 557 (djs, dj_aliases)
--
-- 자정 넘김 표현 (설계의 핵심 결정):
--   포스터의 "07:00-08:00"은 익일 새벽이다. TIME 컬럼으로 저장하면
--   ORDER BY 가 07:00 을 맨 앞으로 올려 재생 순서가 통째로 깨진다.
--   그래서 "영업일 06:00을 원점으로 한 경과 분(정수)"으로 저장한다.
--     22:00 → 960,  00:00 → 1080,  07:00 → 1500,  08:00 → 1560
--   ORDER BY start_min 이 곧 재생 순서. end_min > start_min 하나로 유효성 검증 끝.
--   변환 로직은 src/lib/utils/hotdeal.ts 의 toBusinessMinutes()/nowBusinessMinutes()
--   (이번 작업에서 export 승격) 와 반드시 동일해야 한다 — 복붙 금지, 재사용만.
--
-- event_date 는 "영업일 날짜". 새벽 3시 셋도 캘린더 날짜가 아니라 전날 날짜로 기록한다.
-- (getBusinessDowKey() 와 동일 기준)
--
-- source 값 4종:
--   admin_manual — 운영자가 포스터 없이 직접 입력
--   admin_vision — 운영자가 포스터 업로드 → Vision 파싱 → 확인 후 저장
--   ig_auto      — 자동 수집 + 신뢰도 통과로 사람 손 없이 게시
--   ig_review    — 자동 수집했지만 운영자가 검토 큐에서 확정
--   (ig_auto/ig_review 를 분리하는 이유: 자동 게시 정확도를 사후 감사하기 위함 —
--    이게 IG_AUTO_PUBLISH_ENABLED 임계값 튜닝의 유일한 근거가 된다)
-- ============================================================================

-- ============================================================================
-- 1) club_lineups — 클럽 × 영업일 = 라인업 1건
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

  -- 영업일 날짜 (포스터의 "8/28 금"). 새벽 셋도 이 날짜로 귀속.
  event_date DATE NOT NULL,

  -- DOOR OPEN. 영업일 06:00 기준 경과 분. NULL = 미지정
  door_open_min INTEGER CHECK (door_open_min IS NULL OR door_open_min BETWEEN 0 AND 1560),

  -- 포스터에 파티명이 있으면 (예: "HALLOWEEN NIGHT")
  event_title TEXT,

  -- 원본 포스터 보관 (감사·재검토용). 공개 노출 안 함
  poster_url TEXT,

  source TEXT NOT NULL DEFAULT 'admin_manual'
    CHECK (source IN ('admin_manual', 'admin_vision', 'ig_auto', 'ig_review')),

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- 자동 수집 경로로 들어온 경우 원본 초안 역추적 (lineup_drafts 는 Migration 561)
  draft_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 한 클럽 × 한 영업일 = 라인업 1건. weekly_hotdeal_slots(club_id, slot_date) 선례
  UNIQUE(club_id, event_date)
);

CREATE INDEX IF NOT EXISTS idx_club_lineups_date ON club_lineups(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_club_lineups_club_date ON club_lineups(club_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_club_lineups_draft ON club_lineups(draft_id) WHERE draft_id IS NOT NULL;

-- is_test 컬럼은 두지 않는다 — clubs.is_test 조인으로 충분하고 hideTestData() 규약과 맞는다.

-- ============================================================================
-- 2) lineup_sets — 라인업 안의 시간대별 DJ 셋
-- ============================================================================
CREATE TABLE IF NOT EXISTS lineup_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES club_lineups(id) ON DELETE CASCADE,

  -- ON DELETE RESTRICT: 플레이 이력이 남은 DJ가 실수로 삭제되는 것을 막는다.
  -- DJ 삭제는 djs.deleted_at 소프트 삭제만 쓴다.
  dj_id UUID NOT NULL REFERENCES djs(id) ON DELETE RESTRICT,

  -- 영업일 06:00 기준 경과 분
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1560),
  end_min   INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1620),

  -- 포스터 원문 표기 보존 (매칭 감사·재검토용). 예: "BERMUDA DJ"
  raw_name TEXT,

  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_min > start_min),
  -- 같은 라인업 안에서 같은 시작 시각 중복 방지
  UNIQUE(lineup_id, start_min)
);

CREATE INDEX IF NOT EXISTS idx_lineup_sets_lineup ON lineup_sets(lineup_id, start_min);
CREATE INDEX IF NOT EXISTS idx_lineup_sets_dj ON lineup_sets(dj_id);

-- ============================================================================
-- 3) updated_at 자동 갱신
-- ============================================================================
DROP TRIGGER IF EXISTS club_lineups_updated_at ON club_lineups;
CREATE TRIGGER club_lineups_updated_at
  BEFORE UPDATE ON club_lineups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4) 코멘트
-- ============================================================================
COMMENT ON TABLE club_lineups IS '클럽 × 영업일 타임테이블. UNIQUE(club_id, event_date) — upsert_club_lineup() RPC(Migration 559)로만 쓴다.';
COMMENT ON COLUMN club_lineups.event_date IS '영업일 날짜. 새벽 셋도 전날 날짜로 귀속 (getBusinessDowKey 기준).';
COMMENT ON COLUMN lineup_sets.start_min IS '영업일 06:00 기준 경과 분. 22:00=960, 00:00=1080, 07:00=1500. TIME 타입 금지 — 정렬이 깨짐.';
COMMENT ON COLUMN lineup_sets.dj_id IS 'ON DELETE RESTRICT — 이력 있는 DJ는 삭제 불가, deleted_at 소프트 삭제만.';
