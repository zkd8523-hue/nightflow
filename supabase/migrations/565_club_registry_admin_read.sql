-- ============================================================================
-- Migration 565: club_name_registry / club_events — admin 읽기 정책 추가
-- 날짜: 2026-08-26
-- 배경:
--   563에서 두 테이블 RLS를 service_role 전용으로 걸었는데, /admin/club-discovery
--   페이지는 로그인 관리자 세션(anon key + 쿠키, role='authenticated')으로
--   조회한다. service_role 조건에 안 걸려 "미등록 클럽 없음"으로 빈 화면이 됨
--   (실측 확인 — DB엔 277건 있는데 화면 0건).
--   is_admin()은 559(lineups_rls)에서 이미 정의됨. 재사용.
-- ============================================================================

DROP POLICY IF EXISTS "admin can read registry" ON club_name_registry;
CREATE POLICY "admin can read registry" ON club_name_registry
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin can read all events" ON club_events;
CREATE POLICY "admin can read all events" ON club_events
  FOR SELECT USING (is_admin());
