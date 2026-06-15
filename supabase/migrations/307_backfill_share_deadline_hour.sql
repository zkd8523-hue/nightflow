-- ============================================================================
-- Migration 307: 기존 자동생성 조각의 마감시각을 옵션 deadline_hour로 보정 (1회성)
-- 날짜: 2026-06-14
-- 배경:
--   306에서 share_options.deadline_hour(기본 3=익일 새벽3시)를 도입하고
--   generate-share-listings Edge Function이 익일 N시 마감으로 생성하도록 바꿨다.
--   그러나 함수 배포 "이전"에 이미 자동생성된 조각들은 옛 로직(endOf('day')=
--   당일 23:59:59 KST)으로 share_deadline 이 박혀 있어, 자정에 만료되어 정작
--   클럽이 붐비는 새벽 시간대에 카드가 사라진다.
--
--   cron(generate-share-listings)은 멱등(이미 있으면 skip)이라 기존 row 를
--   고치지 않으므로, 1회성 UPDATE 로 보정한다.
--
-- 대상 (보수적으로 좁힘 — 의도치 않은 데이터 변경 방지):
--   1) listing_type='share' AND share_option_id IS NOT NULL  (자동생성분만)
--      → 수동 등록 조각은 MD 가 폼에서 직접 정한 마감이라 건드리지 않음.
--   2) status NOT IN ('cancelled','unsold','won','contacted','confirmed')
--      → 아직 진행 중(active/scheduled)인 것만. 이미 끝난 밤은 되살리지 않음.
--   3) share_deadline > now()  → 아직 안 지난 것만 (이미 만료된 과거 조각 제외).
--   4) 옵션의 deadline_hour 와 현재 마감 시각이 다른 경우만 (이미 맞으면 skip).
--
-- 보정값:
--   share_deadline = 행사일(event_date) "익일 deadline_hour시" KST → UTC.
--   = (event_date + 1일) 의 deadline_hour 시(KST) 를 timestamptz 로.
--   auction_end_at 도 동일하게 맞춘다(레거시 경매 컬럼, 노출/정합성용).
--
--   ⚠️ share_date(GENERATED, Mig 306: (share_deadline AT TIME ZONE 'Asia/Seoul'
--      - INTERVAL '6 hours')::DATE)는 share_deadline 변경 시 자동 재계산된다.
--      익일 0~6시 마감이면 (-6h) 로 행사 당일이 유지되어 날짜가 밀리지 않는다.
--      (deadline_hour 는 306 CHECK 로 0~8 이지만, 6시 초과로 잡은 옵션이 있으면
--       그 조각의 share_date 가 익일로 밀릴 수 있음 — 정상 동작, 의도된 경계.)
--
-- 참조: 306_share_deadline_hour.sql, generate-share-listings/index.ts(deadlineKstISO)
-- ============================================================================

UPDATE auctions a
SET
  share_deadline = (
    -- 행사일 익일 deadline_hour시 (KST 벽시계) → UTC timestamptz
    ((a.event_date + 1)::timestamp + (o.deadline_hour || ' hours')::interval)
      AT TIME ZONE 'Asia/Seoul'
  ),
  auction_end_at = (
    ((a.event_date + 1)::timestamp + (o.deadline_hour || ' hours')::interval)
      AT TIME ZONE 'Asia/Seoul'
  )
FROM share_options o
WHERE a.share_option_id = o.id
  AND a.listing_type = 'share'
  AND a.share_option_id IS NOT NULL
  AND a.status NOT IN ('cancelled', 'unsold', 'won', 'contacted', 'confirmed')
  AND a.share_deadline > now()
  AND a.event_date IS NOT NULL
  -- 이미 보정된(목표 시각과 동일한) 조각은 건드리지 않음 (멱등)
  AND a.share_deadline IS DISTINCT FROM (
    ((a.event_date + 1)::timestamp + (o.deadline_hour || ' hours')::interval)
      AT TIME ZONE 'Asia/Seoul'
  );

-- 결과 확인용 (적용 후 대시보드에서 함께 실행해 영향받은 row 확인):
--   SELECT id, title, event_date, share_date,
--          share_deadline AT TIME ZONE 'Asia/Seoul' AS deadline_kst
--   FROM auctions
--   WHERE listing_type = 'share' AND share_option_id IS NOT NULL
--     AND share_deadline > now()
--   ORDER BY event_date;
