-- ============================================================================
-- Migration 231: 클럽 별칭(aliases) + 검색 실패 로그
-- 날짜: 2026-05-24
-- 설명:
--   "Club Ace" 같은 클럽이 "에이스", "ace", "에이쓰" 등 다양한 표기로
--   검색되도록 aliases TEXT[] 컬럼 추가.
--
--   검색 실패는 search_misses에 기록 → admin이 빈도순으로 보고
--   해당 클럽의 aliases에 추가하는 피드백 루프.
--
--   정규화 규칙 (DB가 아닌 클라이언트 측):
--     - 소문자 변환
--     - 양끝 공백 제거
--     - 연속 공백 1개로 압축
-- ============================================================================

-- ============================================================================
-- 1) clubs.aliases 추가
-- ============================================================================
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_clubs_aliases_gin ON clubs USING GIN (aliases);

COMMENT ON COLUMN clubs.aliases IS '검색용 별칭 목록 (예: ["에이스", "ace", "club ace"])';

-- ============================================================================
-- 2) search_misses 테이블
--    중복 방지: 동일 user(또는 익명 IP 해시)+query 1시간 내 1건만
-- ============================================================================
CREATE TABLE IF NOT EXISTS search_misses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,                 -- 원본 입력
  normalized_query TEXT NOT NULL,      -- 정규화된 버전 (집계 키)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  resolved_alias_for UUID REFERENCES clubs(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_misses_normalized ON search_misses(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_misses_created ON search_misses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_misses_unresolved
  ON search_misses(created_at DESC) WHERE resolved_alias_for IS NULL;

COMMENT ON TABLE search_misses IS '클럽 검색 결과 0건이었던 쿼리 로그 (별칭 보강용)';

-- RLS: 익명도 INSERT 가능 (검색 실패는 누가 검색했든 가치 있음)
ALTER TABLE search_misses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a miss"
  ON search_misses
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Admin can read all misses"
  ON search_misses
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update misses (resolve)"
  ON search_misses
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 3) RPC: 검색 실패 로깅 (중복 방지 포함)
--    동일 user_id + normalized_query 1시간 내 중복은 무시.
--    익명(user_id NULL)은 IP 기반 중복 방지가 어려우므로 그냥 INSERT.
-- ============================================================================
CREATE OR REPLACE FUNCTION log_search_miss(
  p_query TEXT,
  p_normalized TEXT,
  p_result_count INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN
    RETURN;
  END IF;

  -- 로그인 유저는 1시간 내 중복 차단
  IF v_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM search_misses
      WHERE user_id = v_user_id
        AND normalized_query = p_normalized
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO search_misses (query, normalized_query, user_id, result_count)
  VALUES (p_query, p_normalized, v_user_id, p_result_count);
END;
$$;

COMMENT ON FUNCTION log_search_miss(TEXT, TEXT, INTEGER)
  IS '검색 실패(결과 0건) 로그 기록. 로그인 유저는 1시간 내 동일 쿼리 중복 차단.';

-- ============================================================================
-- 4) RPC: search_misses 빈도 집계 (Admin용)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_search_miss_summary(
  p_limit INTEGER DEFAULT 100,
  p_only_unresolved BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  normalized_query TEXT,
  miss_count BIGINT,
  sample_query TEXT,
  last_seen TIMESTAMPTZ,
  resolved_alias_for UUID
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
      AS resolved_alias_for
  FROM search_misses sm
  WHERE (NOT p_only_unresolved) OR sm.resolved_alias_for IS NULL
  GROUP BY sm.normalized_query
  ORDER BY miss_count DESC, last_seen DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION admin_get_search_miss_summary(INTEGER, BOOLEAN)
  IS 'normalized_query 기준 빈도 집계 (Admin only)';

-- ============================================================================
-- 5) RPC: 별칭 등록 + miss 해소 (atomic)
--    admin이 "에이쓰" 같은 miss를 보고 "Club Ace"에 매핑할 때 호출.
--    clubs.aliases에 추가하고, 같은 normalized_query의 미해소 miss 일괄 표시.
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_resolve_search_miss(
  p_normalized_query TEXT,
  p_alias TEXT,
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_added INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_admin_id AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin only');
  END IF;

  -- 별칭 추가 (중복 방지)
  UPDATE clubs
    SET aliases = array_append(aliases, lower(trim(p_alias)))
    WHERE id = p_club_id
      AND NOT (aliases @> ARRAY[lower(trim(p_alias))]);

  -- 같은 normalized_query의 미해소 miss 일괄 표시
  UPDATE search_misses
    SET resolved_alias_for = p_club_id,
        resolved_at = now()
    WHERE normalized_query = p_normalized_query
      AND resolved_alias_for IS NULL;

  GET DIAGNOSTICS v_added = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'resolved_count', v_added);
END;
$$;

COMMENT ON FUNCTION admin_resolve_search_miss(TEXT, TEXT, UUID)
  IS '별칭 추가 + 동일 normalized_query miss 일괄 해소 (Admin only)';
