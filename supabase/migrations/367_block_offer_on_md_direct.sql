-- ============================================================================
-- Migration 367: MD 직통 조각(host_is_md)에는 오퍼 금지
-- 날짜: 2026-07-05
-- 설명:
--   MD 직통 조각도 is_recruiting_party=true라 다른 MD 화면에 뜨고 오퍼가 들어갈 수 있음.
--   남의 클럽 직통 조각에 오퍼 = 넌센스 → puzzle_offers INSERT 트리거로 차단.
--   (submit_offer 함수를 건드리지 않아 다른 세션 작업과 충돌 없음)
-- ============================================================================
CREATE OR REPLACE FUNCTION block_offer_on_md_direct()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM puzzles
    WHERE id = NEW.puzzle_id AND host_is_md = true
  ) THEN
    RAISE EXCEPTION 'MD 직통 조각에는 오퍼할 수 없어요';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_offer_on_md_direct_trg ON puzzle_offers;
CREATE TRIGGER block_offer_on_md_direct_trg
  BEFORE INSERT ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION block_offer_on_md_direct();
