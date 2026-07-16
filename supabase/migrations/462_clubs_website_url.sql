-- 462: clubs.website_url
-- 배경: 풀파티/이벤트 venue(반얀트리 등)는 인스타보다 공식 홈페이지가 주 채널.
--   instagram(핸들만 저장)에 URL을 넣을 수 없어 별도 컬럼 추가.
--   클럽 상세에서 "공식 홈페이지" 링크로 노출.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN clubs.website_url IS
  '공식 홈페이지 URL (풀파티/이벤트 venue용). 클럽 상세에서 링크 노출.';
