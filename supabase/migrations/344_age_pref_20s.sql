-- 344_age_pref_20s.sql
-- 조각(파티원 모집) 연령 선택을 3분할(상관없음 / 20대 / 30대)로 단순화.
-- '20s'(20대) 값을 age_pref 허용 집합에 추가. 기존 값(early_/late_/mid_/30s)은 backward compat 유지.

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS age_pref_valid;

ALTER TABLE puzzles ADD CONSTRAINT age_pref_valid CHECK (
  array_length(age_pref, 1) >= 1
  AND age_pref <@ ARRAY['early_20s', 'late_20s', '20s', '30s', 'early_30s', 'mid_30s', 'any']::TEXT[]
);

COMMENT ON CONSTRAINT age_pref_valid ON puzzles IS
  'age_pref 배열 원소는 허용 집합의 부분집합 + 최소 1개. 20s/30s는 조각 3분할용, early_/late_/mid_는 레거시 backward compat.';
