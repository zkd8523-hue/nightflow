-- ============================================================================
-- Migration 569: 라인업 쓰기 경로에 service_role 허용 (영향 범위 국소화)
-- 날짜: 2026-08-26
-- 배경:
--   Admin 화면(/admin/lineups)의 publish 라우트는 service_role 클라이언트로
--   djs INSERT는 성공하지만(service_role은 RLS 자체를 우회), 그 다음
--   upsert_club_lineup() RPC 안에서 is_admin()이 auth.uid()로 users를 조회하는데
--   service_role 호출은 auth.uid()가 NULL이라 항상 실패한다. 실제로 이 상태에서
--   "게시하기"를 누르면 DJ만 먼저 생성되고 club_lineups는 저장되지 않은 채
--   실패하며, 재시도 시 이미 만든 DJ와 slug 충돌이 난다(재현 확인됨).
--
--   같은 문제를 다른 세션이 Migration 567에서 is_admin() 자체를
--   service_role도 통과하도록 전역 확장하는 방식으로 풀려고 했으나, is_admin()은
--   users RLS 락다운(533)·채팅(284)·와글 SHOT(315/322/325)·신고 처리(488)·
--   쿠폰(539) 등 28개 마이그레이션이 공유하는 전역 헬퍼라 그 확장은 라인업 4개
--   테이블 밖의 RLS 정책 전체를 동시에 완화시킨다. is_admin()은 그대로 두고,
--   라인업 쓰기 경로만 별도 헬퍼로 분리해 영향 범위를 정확히 라인업으로 좁힌다.
-- ============================================================================

-- ============================================================================
-- 1) can_write_lineups() — 라인업 4테이블 + RPC 전용. is_admin()은 불변.
-- ============================================================================
CREATE OR REPLACE FUNCTION can_write_lineups()
RETURNS BOOLEAN AS $$
  SELECT auth.role() = 'service_role' OR is_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION can_write_lineups() IS
  '라인업 쓰기 전용 게이트. is_admin() 결과에 service_role(Admin 화면의 publish 라우트, 자동 수집기)을 더한 것. 영향 범위를 djs/dj_aliases/club_lineups/lineup_sets 로 한정하기 위해 전역 is_admin() 대신 이 함수를 쓴다.';

-- ============================================================================
-- 2) 쓰기 정책을 can_write_lineups() 로 교체 (읽기 정책은 손대지 않음)
-- ============================================================================
DROP POLICY IF EXISTS djs_write_admin ON djs;
CREATE POLICY djs_write_admin ON djs
  FOR ALL USING (can_write_lineups()) WITH CHECK (can_write_lineups());

DROP POLICY IF EXISTS dj_aliases_write_admin ON dj_aliases;
CREATE POLICY dj_aliases_write_admin ON dj_aliases
  FOR ALL USING (can_write_lineups()) WITH CHECK (can_write_lineups());

DROP POLICY IF EXISTS club_lineups_write_admin ON club_lineups;
CREATE POLICY club_lineups_write_admin ON club_lineups
  FOR ALL USING (can_write_lineups()) WITH CHECK (can_write_lineups());

DROP POLICY IF EXISTS lineup_sets_write_admin ON lineup_sets;
CREATE POLICY lineup_sets_write_admin ON lineup_sets
  FOR ALL USING (can_write_lineups()) WITH CHECK (can_write_lineups());

-- ============================================================================
-- 3) upsert_club_lineup() 재정의 — 가드만 can_write_lineups() 로 교체.
--    본문 로직은 559와 동일(replace-all 방식).
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
  IF NOT can_write_lineups() THEN
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
  '라인업 저장의 유일한 경로. 수동/자동 공용. replace-all 방식. 가드는 can_write_lineups() (Migration 569).';
