-- ============================================================
-- Migration 299: 클럽 테이블맵 다중 등록 지원
-- ============================================================
-- 기존 clubs.floor_plan_url (단일 string)은 그대로 유지하면서
-- 새 컬럼 floor_plan_urls (TEXT[])을 추가해 여러 장 등록 가능하게 함.
--
-- 노출/편집 로직은 우선순위:
--   1) floor_plan_urls 배열이 비어있지 않으면 → 슬라이드로 노출
--   2) 비어있고 floor_plan_url이 있으면 → 단일 사진 노출 (하위 호환)
--
-- 기존 floor_plan_url만 있던 row는 자동 백필.
-- ============================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS floor_plan_urls TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN clubs.floor_plan_urls IS
  '테이블맵 사진 URL 배열 (Supabase Storage public URL). 여러 장 슬라이드로 노출. 단일은 floor_plan_url에 하위호환.';

-- 기존 floor_plan_url 값을 floor_plan_urls로 백필
UPDATE clubs
SET floor_plan_urls = ARRAY[floor_plan_url]
WHERE floor_plan_url IS NOT NULL
  AND floor_plan_url <> ''
  AND (floor_plan_urls IS NULL OR cardinality(floor_plan_urls) = 0);
