-- ============================================================================
-- Migration 513: 템플릿 보관 상한 6 → 9
-- 날짜: 2026-08-05
-- 배경:
--   505에서 6개로 잡았으나(302 주석의 "자리 등급 5 + 여유 1" 근거), 실제로 이미
--   9개를 보유한 MD가 있어 "9/6" 처럼 초과 상태로 표시됐다. 등급을 세분화하는
--   운영 방식을 막을 이유가 없어 상한을 9로 올린다.
--
--   같은 클럽·같은 날 발행 상한(enforce_daily_share_limit의 6개)은 그대로 둔다 —
--   그건 피드에 한 클럽이 하루에 몇 장까지 뜨느냐의 문제라 성격이 다르다.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_auction_template_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.listing_type = 'share' AND (
    SELECT COUNT(*) FROM auction_templates
    WHERE md_id = NEW.md_id AND listing_type = 'share'
  ) >= 9 THEN
    RAISE EXCEPTION '템플릿은 최대 9개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;
