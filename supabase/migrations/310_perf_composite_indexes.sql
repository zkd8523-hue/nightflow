-- Migration 310: 성능 복합 인덱스 추가
--
-- 배경: MD 대시보드 / 홈 / 마이페이지의 핵심 쿼리들이 단일 컬럼 인덱스만
-- 사용해 AND 조건 조합에서 필터링 효율이 떨어졌다. 실제 코드의 WHERE 패턴에
-- 정확히 맞는 복합 인덱스만 추가한다. (이미 partial 인덱스로 커버되는
-- noshow 큐, share_claims RLS 서브쿼리 등은 중복 방지 위해 제외)
--
-- 적용: Supabase 대시보드 SQL Editor에 수동 적용 (db push 금지)

-- 1) puzzles RLS 멤버십 체크 가속
--    정책: EXISTS(SELECT 1 FROM puzzle_members WHERE puzzle_id=? AND user_id=?)
--    기존 단일 (puzzle_id), (user_id)로는 복합 lookup이 인덱스 한쪽만 탐.
CREATE INDEX IF NOT EXISTS idx_puzzle_members_puzzle_user
  ON puzzle_members(puzzle_id, user_id);

-- 2) MD 오퍼 목록 조회 가속
--    패턴: WHERE md_id=? AND status IN ('pending','accepted') ORDER BY created_at DESC
--    (md/dashboard/page.tsx, OfferSheet 등에서 반복)
CREATE INDEX IF NOT EXISTS idx_puzzle_offers_md_status_created
  ON puzzle_offers(md_id, status, created_at DESC);

-- 3) MD 매물 목록 조회 가속
--    패턴: WHERE md_id=? AND status=? (대시보드 탭 분류 + 활성/종료 필터)
--    기존 (md_id), (md_id, created_at)로는 status 필터가 인덱스 밖에서 처리됨.
CREATE INDEX IF NOT EXISTS idx_auctions_md_status
  ON auctions(md_id, status);
