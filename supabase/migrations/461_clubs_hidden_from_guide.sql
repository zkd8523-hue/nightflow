-- 461: clubs.hidden_from_guide
-- 배경: 반얀트리 풀파티 같은 "클럽 아닌 venue"도 MD가 조각/깃발/오퍼로 영업해야 함.
--   clubs 테이블을 재활용하면 auctions(club_id 참조) 인프라가 그대로 작동.
--   단, 클럽 가이드(/clubs)·지도에는 노출되면 안 됨 → 이 플래그로 가이드 노출만 차단.
--   조각/깃발 상세, 직접 링크로는 정상 접근 가능.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS hidden_from_guide BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN clubs.hidden_from_guide IS
  '클럽 가이드(/clubs)·지도 노출 차단. 반얀트리 풀파티 등 비-클럽 venue용. 조각/깃발/오퍼는 정상 작동.';
