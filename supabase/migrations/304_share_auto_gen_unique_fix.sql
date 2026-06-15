-- ============================================================================
-- Migration 304: 조각 자동생성을 위한 UNIQUE 제약 분리 + share_option_id
-- 날짜: 2026-06-13
-- 배경 (가장 중요한 변경):
--   기존 idx_share_one_per_day_per_md = (md_id, share_date) UNIQUE (172:115)는
--   "MD 하루 1조각"이라, 같은 토요일에 메인+일반 옵션 2개를 자동생성하면
--   둘 다 같은 share_date(토요일 마감일)를 가져 2번째 INSERT가 23505로 실패한다.
--
-- 해결:
--   1) auctions에 share_option_id 추적 컬럼 추가 (어떤 옵션이 만든 조각인지 + 멱등 키)
--   2) 기존 단일 UNIQUE를 부분 인덱스 2개로 분리:
--      - 자동(share_option_id IS NOT NULL): (md_id, club_id, share_date, share_option_id)
--        → 같은 날 다른 옵션 허용 + 같은 옵션 중복 생성 방지(멱등)
--      - 수동(share_option_id IS NULL): (md_id, share_date) 유지
--        → 기존 수동 등록 "하루 1조각" 보호 그대로
--
-- 참조: 172_share_listing_type.sql:115 (원래 인덱스), 302_share_options.sql
-- ============================================================================

-- 1) share_option_id 추적 컬럼
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS share_option_id UUID REFERENCES share_options(id) ON DELETE SET NULL;

COMMENT ON COLUMN auctions.share_option_id IS
  '이 조각을 만든 share_options id (자동생성분). 수동 등록은 NULL. 멱등/추적용.';

-- 2) 기존 단일 인덱스 제거
DROP INDEX IF EXISTS idx_share_one_per_day_per_md;

-- 3-a) 수동 등록(옵션 없음): 기존 "MD 하루 1조각" 보호 유지
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_one_per_day_manual
  ON auctions (md_id, share_date)
  WHERE listing_type = 'share'
    AND share_option_id IS NULL
    AND status NOT IN ('cancelled', 'unsold');

-- 3-b) 자동 생성(옵션 있음): 옵션 단위 1건 (같은 날 다른 옵션은 허용, 같은 옵션 중복 차단)
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_one_per_day_per_option
  ON auctions (md_id, club_id, share_date, share_option_id)
  WHERE listing_type = 'share'
    AND share_option_id IS NOT NULL
    AND status NOT IN ('cancelled', 'unsold');
