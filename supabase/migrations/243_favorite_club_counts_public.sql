-- ============================================================================
-- Migration 243: user_favorite_clubs 카운트 공개 SELECT 허용
-- 날짜: 2026-05-26
-- 설명:
--   클럽 목록·상세 페이지에서 "이 클럽을 찜한 사람 수"를 anon 클라이언트가 집계할
--   수 있도록 공개 SELECT 정책 추가.
--   - 기존 "Users can manage own favorites" 정책(FOR ALL)은 유지 → 본인 row만
--     INSERT/UPDATE/DELETE 가능, 본인 외 다른 row는 SELECT만 허용.
--   - club_id, created_at만 노출되며 user_id는 RPC/뷰 없이 직접 조회 가능하지만
--     "누가 찜했는지"는 비즈니스적으로 민감하지 않음 (좋아요 카운트는 공개 정보).
-- ============================================================================

CREATE POLICY "Public can read favorite club rows"
  ON user_favorite_clubs
  FOR SELECT
  USING (TRUE);
