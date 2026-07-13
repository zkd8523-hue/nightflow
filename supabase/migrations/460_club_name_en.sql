-- ============================================================================
-- Migration 460: 클럽 영문 표시명 (name_en)
--
-- 배경: 외국인 트랙(en/ja/zh/zh-tw)에서 순수 한글 클럽명("아르쥬 청담 라운지", "도깨비" 등)이
--      그대로 노출됨 — 로고는 영문(ARZU)인데 DB name은 한글 설명형이라 별칭(aliases)으로도
--      자동 추출 불가. name_en 없으면 name(한글) 그대로 fallback.
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS name_en TEXT;

COMMENT ON COLUMN clubs.name_en IS
  '외국인 트랙(en/ja/zh/zh-tw)용 표시 이름. NULL이면 name(한글) 그대로 사용.';
