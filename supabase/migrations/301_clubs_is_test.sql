-- =============================================================
-- 301: clubs.is_test 컬럼 추가 (테스트/운영자 클럽 마킹)
-- =============================================================
-- 배경:
--   지금까지 테스트 클럽은 name LIKE '%운영자%' 문자열 매칭으로만 숨겼다.
--   - 클럽 이름에 "운영자"가 빠지면 즉시 누출, 정식 클럽명에 들어가면 오탐.
--   - 깃발(puzzles)은 클럽과 무관(club_id 없음)하므로 leader → users.is_test 로
--     식별. users.is_test 는 이미 Migration 204 에서 추가됨.
--   본 마이그레이션은 clubs 에도 동일한 단일 진실 소스(is_test)를 둬서
--   프론트/sitemap 필터를 이름 매칭 대신 boolean 한 컬럼으로 통일한다.
--
-- 적용 범위(이번 작업): 홈피드 조각+깃발, sitemap.
--   (상세 페이지/지역 페이지 직접 접근 차단은 별도 후속 작업)
-- =============================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- 부분 인덱스: is_test=true 인 소수 행만 인덱싱 (users.is_test 와 동일 패턴)
CREATE INDEX IF NOT EXISTS idx_clubs_is_test ON clubs(is_test) WHERE is_test = true;

-- 기존 "운영자" 문자열 매칭으로 숨기던 클럽들을 is_test=true 로 백필.
-- 기존 ilike '%운영자%' 와 정확히 같은 집합을 마킹한다.
UPDATE clubs
SET is_test = true
WHERE name ILIKE '%운영자%'
  AND is_test = false;

COMMENT ON COLUMN clubs.is_test IS
  '테스트/운영자 클럽 여부. true 면 프로덕션 홈피드·sitemap에서 제외. 이름 문자열 매칭(%운영자%)을 대체하는 단일 진실 소스.';
