-- ============================================================================
-- Migration 601: search_misses에 surface(검색 화면) 구분 추가
-- 날짜: 2026-08-28
-- 설명:
--   231이 만든 "검색 실패 → admin 별칭 등록" 루프가 /clubs 한 화면에서만 돌고
--   있었다. /lineups·/events의 검색 실패는 아무데도 기록되지 않아, 어떤 표기를
--   별칭으로 보강해야 하는지 알 수 없었다.
--
--   세 화면 모두 로깅을 켜되, 한 통에 섞으면 안 된다:
--   admin_resolve_search_miss는 무조건 clubs.aliases에 append하므로
--   DJ/아티스트 이름 미스에 클럽을 매핑하면 잘못된 별칭이 들어간다.
--   surface로 구분해 admin이 클럽 미스만 해소하게 한다.
--
--   ⚠️ 하위호환: 구버전 네이티브 앱(Capacitor)이 3-인자 log_search_miss를
--      계속 호출한다. 4번째 인자에 DEFAULT를 줘 그대로 흡수한다.
--      단 구 3-인자 함수를 남겨두면 PostgREST에서 오버로드 모호성 오류가 나므로
--      반드시 DROP 후 재생성한다.
-- ============================================================================

-- ============================================================================
-- 1) surface 컬럼
--    기존 행은 전부 ClubList(/clubs) 발이므로 'clubs' 디폴트가 사실과 맞다.
-- ============================================================================
ALTER TABLE search_misses
  ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'clubs';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_misses_surface_check'
  ) THEN
    ALTER TABLE search_misses
      ADD CONSTRAINT search_misses_surface_check
      CHECK (surface IN ('clubs', 'lineups', 'events'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_misses_surface
  ON search_misses(surface, created_at DESC);

COMMENT ON COLUMN search_misses.surface
  IS '검색이 일어난 화면: clubs(/clubs) | lineups(/lineups) | events(/events)';

-- ============================================================================
-- 2) log_search_miss — p_surface 추가
--    DROP 후 재생성(오버로드 모호성 회피). DEFAULT 덕에 3-인자 호출도 동작.
-- ============================================================================
DROP FUNCTION IF EXISTS log_search_miss(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION log_search_miss(
  p_query TEXT,
  p_normalized TEXT,
  p_result_count INTEGER DEFAULT 0,
  p_surface TEXT DEFAULT 'clubs'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_surface TEXT := COALESCE(NULLIF(trim(p_surface), ''), 'clubs');
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN
    RETURN;
  END IF;

  -- CHECK 제약 위반으로 로깅이 예외를 던지면 검색 UX를 해친다. 모르는 값은 clubs로.
  IF v_surface NOT IN ('clubs', 'lineups', 'events') THEN
    v_surface := 'clubs';
  END IF;

  -- 로그인 유저는 1시간 내 중복 차단. 단 화면이 다르면 별개로 센다
  -- ("볼레로"가 /clubs에선 되는데 /events에서만 안 되는 상황을 구분해야 한다).
  IF v_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM search_misses
      WHERE user_id = v_user_id
        AND normalized_query = p_normalized
        AND surface = v_surface
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO search_misses (query, normalized_query, user_id, result_count, surface)
  VALUES (p_query, p_normalized, v_user_id, p_result_count, v_surface);
END;
$$;

COMMENT ON FUNCTION log_search_miss(TEXT, TEXT, INTEGER, TEXT)
  IS '검색 실패(결과 0건) 로그. 로그인 유저는 화면별로 1시간 내 동일 쿼리 중복 차단.';

-- ============================================================================
-- 3) admin_get_search_miss_summary — surface 집계/필터 추가
--    RETURNS TABLE이 바뀌므로 CREATE OR REPLACE 불가 → DROP 필수.
-- ============================================================================
DROP FUNCTION IF EXISTS admin_get_search_miss_summary(INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION admin_get_search_miss_summary(
  p_limit INTEGER DEFAULT 100,
  p_only_unresolved BOOLEAN DEFAULT TRUE,
  p_surface TEXT DEFAULT NULL      -- NULL이면 전체 화면
)
RETURNS TABLE (
  normalized_query TEXT,
  miss_count BIGINT,
  sample_query TEXT,
  last_seen TIMESTAMPTZ,
  resolved_alias_for UUID,
  surface TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    sm.normalized_query,
    COUNT(*) AS miss_count,
    (array_agg(sm.query ORDER BY sm.created_at DESC))[1] AS sample_query,
    MAX(sm.created_at) AS last_seen,
    (array_agg(sm.resolved_alias_for) FILTER (WHERE sm.resolved_alias_for IS NOT NULL))[1]
      AS resolved_alias_for,
    sm.surface
  FROM search_misses sm
  WHERE ((NOT p_only_unresolved) OR sm.resolved_alias_for IS NULL)
    AND (p_surface IS NULL OR sm.surface = p_surface)
  GROUP BY sm.normalized_query, sm.surface
  ORDER BY miss_count DESC, last_seen DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION admin_get_search_miss_summary(INTEGER, BOOLEAN, TEXT)
  IS 'normalized_query + surface 기준 빈도 집계 (Admin only)';
