-- ============================================================================
-- Migration 705: 담당자가 메뉴판에서 고른 구성 + TC 규칙 + 손님 요청 금액 (2026-11-01)
--
-- 담당자 제안서에서 구성을 글로 적던 것을 메뉴판에서 직접 고르게 바꿨다(가격 반영, 금액 이하).
--  · md_menu: 고른 품목·수량·TC·합계(서버가 DB 가격으로 다시 계산해 저장). 클럽이 나중에 가격을 바꿔도 남는다.
--  · clubs.table_charge_rule: 클럽별 TC 규칙 {"below_bottles":4,"amount":50000} = 4병 미만이면 5만원.
--    규칙이 없는 클럽은 TC를 담당자가 직접 넣고 병 수 점검은 하지 않는다.
--  · booking_confirmations.requested_amount: 손님이 낸 금액. 확인서 합계가 이보다 적으면 안내 문구를 붙인다.
--
-- ⚠️ 코드 배포보다 먼저 적용한다 — 제안서·확인서가 이 칸들을 select한다.
-- ============================================================================

ALTER TABLE foreign_requests ADD COLUMN IF NOT EXISTS md_menu JSONB;
ALTER TABLE korean_booking_requests ADD COLUMN IF NOT EXISTS md_menu JSONB;
ALTER TABLE booking_confirmations ADD COLUMN IF NOT EXISTS requested_amount INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS table_charge_rule JSONB;

UPDATE clubs SET table_charge_rule = '{"below_bottles":4,"amount":50000}'::jsonb
 WHERE id = '35de296e-5fdc-435b-baf2-1c7c05538687'; -- Club Ace: 4병 미만 TC 5만원 (우현 확인, 2026-10-30)
