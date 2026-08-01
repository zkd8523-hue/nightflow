-- ============================================================================
-- Migration 490: 진행중 '깃발' 마감 시각을 신규 정책(21:30 오퍼 / 22:30 검토)으로 백필
-- 날짜: 2026-07-20
-- 설명:
--   깃발 오퍼 마감을 20:00→21:30, 검토 마감을 21:00→22:30으로 변경.
--   PuzzleForm 신규 등록 로직은 이미 21:30/22:30으로 반영됐으나,
--   변경 이전에 등록된 open/selecting 깃발은 DB에 구 시각(20:00/21:00)이
--   박혀 있어 상세에 "오후 8시 마감"으로 표시됨. 이번 마이그레이션으로 일괄 정렬.
--
--   대상: 살아있는 '깃발'만 (is_recruiting_party = false, status IN open/selecting).
--        조각(is_recruiting_party = true)은 새벽 3시/4시 마감을 유지하므로 제외.
--        won/expired/matched/cancelled/accepted 등 종료 상태도 제외.
--
--   주의:
--     - event_date가 오늘이고 현재가 이미 21:30 KST를 지났으면 offer_deadline이
--       과거가 되어 다음 cron에서 selecting으로 전환됨(정상 동작).
--     - 22:30도 지났으면 expired로 전환됨(사실상 시간이 지난 깃발, 정상).
--     - review_ending_notified_at 초기화로 selecting 진입 시 임박 알림 재발송 가능.
-- ============================================================================

UPDATE puzzles
SET
  offer_deadline = (event_date + INTERVAL '21 hours 30 minutes') AT TIME ZONE 'Asia/Seoul',
  expires_at     = (event_date + INTERVAL '22 hours 30 minutes') AT TIME ZONE 'Asia/Seoul',
  review_ending_notified_at = NULL
WHERE status IN ('open', 'selecting')
  AND COALESCE(is_recruiting_party, false) = false;
