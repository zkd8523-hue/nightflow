-- Migration 433: admin이 오퍼 채팅 메시지를 조회할 수 있도록 RLS 추가
-- 적용일: 2026-07-09
--
-- 문제: puzzle_offer_messages RLS가 "offer participants access messages"(당사자만) 하나뿐이라
--   admin이 서버에서 메시지를 조회하면 0건 → admin/puzzles의 '대화중/답장대기중' 집계가
--   전부 '답장대기중'으로 잘못 뜸.
-- 해결: admin(users.role='admin')에게 SELECT 허용 정책 추가 (읽기 전용).

DROP POLICY IF EXISTS "Admins can read offer messages" ON puzzle_offer_messages;
CREATE POLICY "Admins can read offer messages" ON puzzle_offer_messages
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
