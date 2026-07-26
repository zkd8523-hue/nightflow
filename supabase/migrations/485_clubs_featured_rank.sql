-- Migration 485: 클럽 상위노출 랭크 (외국인 트랙 Promoted Listings)
-- 배경: /en /ja /zh /zh-tw 클럽 가이드는 리뷰수·MD보유·오퍼수 기반 파생 정렬만 있어
--       특정 클럽을 명시적으로 상위노출할 수단이 없음. featured_rank로 관리자가 지정.
-- 정렬: 홈/목록/지역별 쿼리에서 featured_rank DESC 를 최우선 키로 사용 (0=기본, 높을수록 위)
-- 한국어 가이드는 미적용 (외국인 트랙 전용).

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS featured_rank INTEGER NOT NULL DEFAULT 0;

-- 상위노출 지정 클럽 조회 최적화 (0이 아닌 소수만 인덱싱)
CREATE INDEX IF NOT EXISTS idx_clubs_featured_rank
  ON clubs (featured_rank DESC)
  WHERE featured_rank <> 0;

COMMENT ON COLUMN clubs.featured_rank IS
  '외국인 트랙 상위노출 랭크. 높을수록 목록/홈 최상단. 0=기본(파생 정렬). Promoted Listings 기반.';
