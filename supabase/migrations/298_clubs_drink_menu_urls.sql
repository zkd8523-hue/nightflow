-- ============================================================
-- Migration 298: 클럽 주대 사진 다중 등록 지원
-- ============================================================
-- 기존 clubs.drink_menu_url (단일 string)을 그대로 유지하면서
-- 새 컬럼 drink_menu_urls (TEXT[])을 추가해 여러 장 등록 가능하게 함.
--
-- 노출/편집 로직은 우선순위:
--   1) drink_menu_urls 배열이 비어있지 않으면 → 슬라이드로 노출
--   2) drink_menu_urls 배열이 비어있고 drink_menu_url이 있으면 → 단일 사진 노출 (하위 호환)
--
-- 기존에 drink_menu_url만 있던 row는 트리거 마이그레이션 없이 둠.
-- 사용자가 새로 편집/저장 시 자동으로 drink_menu_urls에 반영됨.
-- ============================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS drink_menu_urls TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN clubs.drink_menu_urls IS
  '주대 사진 URL 배열 (Supabase Storage public URL). 여러 장 슬라이드로 노출. 단일은 drink_menu_url에 하위호환.';

-- 기존 drink_menu_url 값을 drink_menu_urls로 백필 (없으면 빈 배열 유지)
UPDATE clubs
SET drink_menu_urls = ARRAY[drink_menu_url]
WHERE drink_menu_url IS NOT NULL
  AND drink_menu_url <> ''
  AND (drink_menu_urls IS NULL OR cardinality(drink_menu_urls) = 0);
