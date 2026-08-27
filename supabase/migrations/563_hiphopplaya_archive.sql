-- ============================================================================
-- Migration 563: 힙합플레이야 캘린더 아카이브 (일회성 수집)
-- 날짜: 2026-08-26
-- 설명:
--   @hiphopplayacalendar(힙합플레이야) 인스타그램 게시물 캡션을 1회 수집해
--   ① 클럽 게스트 공연 아카이브, ② 클럽명 등장 빈도(클럽 지도)를 만든다.
--
--   범위: 일회성 배치 스크립트 전용 테이블. cron/Edge Function 없음, UI 없음.
--   지속 수집(매주 자동)은 별도 세션이 구축 중인 ig_sources/collection_runs
--   인프라(Migration 557~562, business_discovery API) 완성 후 그 위에 얹는
--   방향으로 검토 — 이번 마이그레이션은 그것과 무관하다.
--
--   포스터 이미지는 저장하지 않는다(저작권). 캡션 원문(raw_caption)과
--   원본 게시물 링크(source_url)만 보관한다.
-- ============================================================================

-- ============================================================================
-- 1) club_events — 공연 아카이브
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 매칭된 clubs 행 (매칭 실패 시 NULL — 신규 클럽 자동 생성 금지)
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  club_name_raw TEXT NOT NULL,
  venue_area TEXT,

  event_date DATE,
  event_date_end DATE,
  title TEXT,
  lineup TEXT[] NOT NULL DEFAULT '{}',

  source_account TEXT NOT NULL,
  source_url TEXT,
  source_post_id TEXT NOT NULL,
  raw_caption TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  parse_confidence SMALLINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (source_post_id, club_name_raw, event_date)
);

CREATE INDEX IF NOT EXISTS idx_club_events_club ON club_events(club_id);
CREATE INDEX IF NOT EXISTS idx_club_events_status ON club_events(status);
CREATE INDEX IF NOT EXISTS idx_club_events_date ON club_events(event_date);

COMMENT ON TABLE club_events IS
  '힙합플레이야 캘린더 등에서 1회 수집한 클럽 게스트 공연 아카이브. UI 미노출, SQL 조회 전용.';

-- ============================================================================
-- 2) club_name_registry — 클럽 지도 (원문 클럽명 집계)
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_name_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name_raw TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL,
  area_guess TEXT,

  event_count INTEGER NOT NULL DEFAULT 0,
  first_seen DATE,
  last_seen DATE,

  matched_club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  instagram_handle TEXT,

  status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (status IN ('unmatched', 'matched', 'ignored')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_name_registry_normalized ON club_name_registry(normalized_name);
CREATE INDEX IF NOT EXISTS idx_club_name_registry_status ON club_name_registry(status);

COMMENT ON TABLE club_name_registry IS
  '수집된 원문 클럽명 집계. event_count 상위 = 씬 활동량 랭킹. matched_club_id로 clubs와 대조.';

-- ============================================================================
-- 3) RLS — service_role만 읽기/쓰기 (이번 작업은 관리자 스크립트 전용, 공개 노출 없음)
-- ============================================================================
ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_name_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON club_events;
CREATE POLICY "service_role full access" ON club_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role full access" ON club_name_registry;
CREATE POLICY "service_role full access" ON club_name_registry
  FOR ALL USING (auth.role() = 'service_role');
