-- ============================================================================
-- Migration 306: 조각 마감을 "익일 N시"로 (자정 만료 → 새벽 마감)
-- 날짜: 2026-06-14
-- 배경:
--   조각(share)은 share_deadline = 당일 23:59:59 KST 로 고정되어 있어,
--   정작 클럽이 가장 붐비는 자정~새벽 시간대에 카드가 사라져 버린다.
--   MD가 "익일 N시"(기본 새벽 3시)까지 마감을 미룰 수 있게 한다.
--
-- 문제:
--   share_deadline 을 익일 새벽으로 늘리면, share_date(GENERATED)가
--   share_deadline 의 KST 날짜라서 행사일 다음날로 하루 밀린다.
--   → 6월 14일(토) 행사인데 마감이 6/15 03:00이면 share_date=6/15(일)로 계산.
--
-- 해결 (옵션 B):
--   share_date GENERATED 식을 "share_deadline - 6시간"의 KST 날짜로 변경.
--   = 영업일 경계(새벽 6시, getBusinessDowKey 규약)와 동일.
--   → 익일 6시 이전 마감은 전날(행사일)로 계산되어 날짜 표시가 안 밀린다.
--   예) 마감 6/15 03:00 → (03:00 - 6h)=6/14 21:00 → share_date=6/14(토) ✓
--
-- ⚠️ immutable 문제 회피 (핵심 — 연산 순서가 전부):
--   "timestamptz +/- interval"은 IMMUTABLE이 아니다(interval의 month/day 성분이
--   timezone/DST에 의존할 수 있어 STABLE). 그래서
--     (share_deadline - INTERVAL '6 hours') AT TIME ZONE 'Asia/Seoul'  ← 거부됨(42P17)
--   반대로 "timestamptz AT TIME ZONE '상수존'"은 IMMUTABLE이고(172가 이 식으로 통과 중),
--   그 결과는 timezone-naive 한 timestamp 다. timestamp(naive)에 대한
--   "- interval '6 hours'" 및 "::date" 는 timezone 무관 → IMMUTABLE.
--   ⇒ interval 빼기를 timestamptz 가 아니라 AT TIME ZONE 변환 "이후"에 적용한다:
--     ((share_deadline AT TIME ZONE 'Asia/Seoul') - INTERVAL '6 hours')::DATE
--   = share_deadline 의 KST 벽시계에서 6시간 뺀 날짜 = 영업일(새벽6시) 경계.
--   검증: 마감 6/15 03:00 KST → KST벽시계 6/15 03:00 - 6h = 6/14 21:00 → 6/14 ✓
--         마감 6/15 06:00 KST → 6/15 06:00 - 6h = 6/15 00:00 → 6/15 (새벽6시 경계) ✓
--         마감 6/14 23:59 KST → 6/14 23:59 - 6h = 6/14 17:59 → 6/14 ✓
--
-- 제약: share_date 는 GENERATED 컬럼이라 식을 ALTER 로 못 바꾼다.
--   DROP COLUMN → 재생성 필요. 단, 304의 두 부분 인덱스가 share_date 에
--   의존하므로 인덱스를 먼저 DROP → 컬럼 재생성 → 인덱스 재생성한다.
--
-- 참조: 172_share_listing_type.sql:73-77 (원 GENERATED), 304 (의존 인덱스),
--       302_share_options.sql, src/lib/utils/hotdeal.ts (BUSINESS_DAY_CUTOFF_HOUR=6)
-- ============================================================================

-- ── 1) share_date 에 의존하는 인덱스 제거 (304에서 생성한 것) ──────────────
DROP INDEX IF EXISTS idx_share_one_per_day_manual;
DROP INDEX IF EXISTS idx_share_one_per_day_per_option;

-- ── 2) share_date GENERATED 식 변경 (DROP → 재생성) ───────────────────────
-- 새 식: (share_deadline - 6시간) 의 KST 날짜.
-- 익일 새벽 6시 이전 마감은 전날(행사일)로 계산 → 날짜 표시 밀림 방지.
ALTER TABLE auctions DROP COLUMN IF EXISTS share_date;

ALTER TABLE auctions
  ADD COLUMN share_date DATE
    GENERATED ALWAYS AS
      (((share_deadline AT TIME ZONE 'Asia/Seoul') - INTERVAL '6 hours')::DATE)
    STORED;

COMMENT ON COLUMN auctions.share_date IS
  '조각 노출/중복판정용 날짜. (share_deadline - 6시간)의 KST 날짜 = 영업일 경계. '
  '익일 새벽 마감(예: 3시)도 행사 당일로 계산되어 날짜가 밀리지 않음.';

-- ── 3) 304 인덱스 재생성 (정의 동일, 304와 1:1 일치 유지) ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_one_per_day_manual
  ON auctions (md_id, share_date)
  WHERE listing_type = 'share'
    AND share_option_id IS NULL
    AND status NOT IN ('cancelled', 'unsold');

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_one_per_day_per_option
  ON auctions (md_id, club_id, share_date, share_option_id)
  WHERE listing_type = 'share'
    AND share_option_id IS NOT NULL
    AND status NOT IN ('cancelled', 'unsold');

-- ── 4) share_options.deadline_hour: 익일 마감 시각 (기본 새벽 3시) ──────────
-- 값 의미: 행사일 "익일" 마감 시각(0~8시). 0 = 당일 자정(24시) 마감.
ALTER TABLE share_options
  ADD COLUMN IF NOT EXISTS deadline_hour INTEGER NOT NULL DEFAULT 3
    CHECK (deadline_hour BETWEEN 0 AND 8);

COMMENT ON COLUMN share_options.deadline_hour IS
  '조각 마감 시각: 행사일 익일 N시(KST). 기본 3 = 익일 새벽 3시. 0 = 당일 자정.';
