-- ============================================================================
-- Migration 179: 깃발/퍼즐 연령 선호 — 30대 분할
-- 추가: early_30s (30초), mid_30s (30중)
-- 기존 '30s' 값은 backward compat 유지 (라벨은 "30대"로 표시)
-- ============================================================================

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS age_pref_valid;

ALTER TABLE puzzles ADD CONSTRAINT age_pref_valid CHECK (
  array_length(age_pref, 1) >= 1
  AND age_pref <@ ARRAY['early_20s', 'late_20s', '30s', 'early_30s', 'mid_30s', 'any']::TEXT[]
);

COMMENT ON CONSTRAINT age_pref_valid ON puzzles IS
  'Migration 179: 30대를 early_30s/mid_30s로 분할. 30s는 legacy 호환.';
