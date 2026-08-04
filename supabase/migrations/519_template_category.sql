-- ============================================================================
-- Migration 519: 조각 템플릿 분류(폴더)
-- 날짜: 2026-08-05
-- 배경:
--   MD는 평일과 주말을 아예 다른 구성으로 굴린다(가격·정원·구성이 전부 다름).
--   템플릿이 9개까지 늘어나면 평일용/주말용이 한 목록에 섞여 어느 게 무엇인지
--   이름으로만 구분해야 한다.
--
--   → 자유 텍스트 분류를 둔다. "평일"/"주말"이 기본 제안이지만 MD가 원하는 대로
--     ("금요일 전용", "이벤트" 등) 쓸 수 있게 고정 enum이 아닌 TEXT로 둔다.
--     NULL = 미분류.
-- ============================================================================

ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_auction_templates_md_category
  ON auction_templates(md_id, category);

COMMENT ON COLUMN auction_templates.category IS
  '템플릿 분류(폴더). 자유 텍스트 — 보통 "평일"/"주말". NULL이면 미분류.';
