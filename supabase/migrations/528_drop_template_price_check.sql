-- ============================================================================
-- Migration 528: 527의 가격 CHECK 제거 (토글까지 막혔음)
-- 날짜: 2026-08-05
-- 배경:
--   527에서 auction_templates.price_per_seat <= 1천만원 CHECK를 NOT VALID로 걸었다.
--   NOT VALID는 "제약을 만드는 시점의 기존 행을 검사하지 않는다"는 뜻일 뿐,
--   그 행을 UPDATE하면 다시 검사한다. 그래서 예전에 만든 12억짜리 테스트 템플릿은
--   가격을 건드리지 않고 is_live만 켜고 끄는 것조차 막혔다
--   ("모두 켜기" → new row for relation ... violates check constraint).
--
--   막으려던 것은 발행 시 total_budget(integer) 오버플로인데, 그건 527의
--   publish_share_template 사전 검사가 이미 잡는다. 저장 단계 제약은 무관한 동작까지
--   막으므로 뗀다. 새로 만들거나 고칠 때의 상한은 클라이언트(MAX_PRICE_MAN)가 담당한다.
-- ============================================================================

ALTER TABLE auction_templates
  DROP CONSTRAINT IF EXISTS chk_auction_templates_price;
