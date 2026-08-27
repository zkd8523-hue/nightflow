-- ============================================================================
-- Migration 559: 라인업 RLS + upsert_club_lineup() RPC
-- 날짜: 2026-08-26
-- 선행: 557 (djs, dj_aliases), 558 (club_lineups, lineup_sets)
--
-- 읽기: 4테이블 전부 공개 SELECT (익명 포함). SEO 크롤러가 봐야 하므로 필수 —
--       이게 빠지면 클럽 상세/DJ 프로필/라인업 아카이브 전부 빈 페이지가 된다.
-- 쓰기: admin only.
--
-- is_admin() 은 이 프로젝트에 기존 정의가 없음을 확인했다(grep 결과 0건).
-- SECURITY DEFINER 필수 — Migration 533이 users 테이블 RLS를 잠갔고, 537이
-- "정책이 users를 다시 SELECT하며 재귀"하는 함정을 이미 겪었다. SECURITY DEFINER로
-- 함수 내부에서는 RLS를 우회해 users.role을 직접 읽어야 재귀를 피한다.
-- ============================================================================

-- ============================================================================
-- 1) is_admin() — 4개 테이블 정책이 공유하는 헬퍼
-- ============================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION is_admin() IS
  '라인업/DJ 테이블 RLS 공용 헬퍼. SECURITY DEFINER로 users RLS 재귀를 피한다 (Migration 537 참조).';

-- ============================================================================
-- 2) RLS 활성화
-- ============================================================================
ALTER TABLE djs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dj_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineup_sets ENABLE ROW LEVEL SECURITY;

-- ------ djs ------
DROP POLICY IF EXISTS djs_select_public ON djs;
CREATE POLICY djs_select_public ON djs
  FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS djs_write_admin ON djs;
CREATE POLICY djs_write_admin ON djs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ------ dj_aliases ------
DROP POLICY IF EXISTS dj_aliases_select_public ON dj_aliases;
CREATE POLICY dj_aliases_select_public ON dj_aliases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS dj_aliases_write_admin ON dj_aliases;
CREATE POLICY dj_aliases_write_admin ON dj_aliases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ------ club_lineups ------
DROP POLICY IF EXISTS club_lineups_select_public ON club_lineups;
CREATE POLICY club_lineups_select_public ON club_lineups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS club_lineups_write_admin ON club_lineups;
CREATE POLICY club_lineups_write_admin ON club_lineups
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ------ lineup_sets ------
DROP POLICY IF EXISTS lineup_sets_select_public ON lineup_sets;
CREATE POLICY lineup_sets_select_public ON lineup_sets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS lineup_sets_write_admin ON lineup_sets;
CREATE POLICY lineup_sets_write_admin ON lineup_sets
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- 3) upsert_club_lineup() — 라인업 저장의 유일한 쓰기 경로
--
--    admin_manual/admin_vision(수동) 과 ig_auto/ig_review(자동)가 전부 이 RPC
--    하나로 수렴한다. replace-all 방식: club_lineups 를 UPSERT 하고,
--    그 라인업의 lineup_sets 는 전체 삭제 후 재삽입 — 재편집이 항상 단순하다.
--
--    p_sets 형식: JSONB 배열, 각 원소:
--      { "dj_id": "uuid", "start_min": int, "end_min": int, "raw_name": text|null }
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_club_lineup(
  p_club_id       UUID,
  p_event_date    DATE,
  p_door_open_min INTEGER,
  p_event_title   TEXT,
  p_poster_url    TEXT,
  p_sets          JSONB,
  p_source        TEXT DEFAULT 'admin_manual',
  p_draft_id      UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_lineup_id UUID;
  v_set       JSONB;
  v_sort      INTEGER := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;

  IF p_source NOT IN ('admin_manual', 'admin_vision', 'ig_auto', 'ig_review') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  IF p_sets IS NULL OR jsonb_array_length(p_sets) < 1 THEN
    RAISE EXCEPTION '셋이 최소 1개 이상 필요합니다';
  END IF;

  INSERT INTO club_lineups (club_id, event_date, door_open_min, event_title, poster_url, source, created_by, draft_id)
  VALUES (p_club_id, p_event_date, p_door_open_min, p_event_title, p_poster_url, p_source, auth.uid(), p_draft_id)
  ON CONFLICT (club_id, event_date) DO UPDATE SET
    door_open_min = EXCLUDED.door_open_min,
    event_title   = EXCLUDED.event_title,
    poster_url    = COALESCE(EXCLUDED.poster_url, club_lineups.poster_url),
    source        = EXCLUDED.source,
    draft_id      = EXCLUDED.draft_id,
    updated_at    = now()
  RETURNING id INTO v_lineup_id;

  -- replace-all: 기존 셋 전부 삭제 후 재삽입
  DELETE FROM lineup_sets WHERE lineup_id = v_lineup_id;

  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    INSERT INTO lineup_sets (lineup_id, dj_id, start_min, end_min, raw_name, sort_order)
    VALUES (
      v_lineup_id,
      (v_set->>'dj_id')::UUID,
      (v_set->>'start_min')::INTEGER,
      (v_set->>'end_min')::INTEGER,
      v_set->>'raw_name',
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'lineup_id', v_lineup_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION upsert_club_lineup IS
  '라인업 저장의 유일한 경로. 수동/자동 공용. replace-all 방식(lineup_sets 전체 재삽입).';
