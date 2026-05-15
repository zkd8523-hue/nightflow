-- ============================================================================
-- Migration 171: 깃발/퍼즐 연령 복수 선택 지원
-- 날짜: 2026-05-16
-- 설명:
--   - age_pref TEXT(단일) → TEXT[](복수) 변환
--   - 기존 데이터는 ARRAY[value] 형태로 backfill
--   - CHECK 제약 재설정: 배열 원소가 valid 값 집합의 부분집합 + 최소 1개
-- ============================================================================

-- 1) 기존 CHECK 제약 제거
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_age_pref_check;

-- 2) 컬럼 타입 변경 + 기존 값 단일 원소 배열로 변환
ALTER TABLE puzzles
  ALTER COLUMN age_pref TYPE TEXT[]
  USING ARRAY[age_pref]::TEXT[];

-- 3) 기본값 재설정
ALTER TABLE puzzles
  ALTER COLUMN age_pref SET DEFAULT ARRAY['any']::TEXT[];

-- 4) 신규 CHECK 제약: 원소 valid + 최소 1개
ALTER TABLE puzzles ADD CONSTRAINT age_pref_valid CHECK (
  array_length(age_pref, 1) >= 1
  AND age_pref <@ ARRAY['early_20s', 'late_20s', '30s', 'any']::TEXT[]
);
