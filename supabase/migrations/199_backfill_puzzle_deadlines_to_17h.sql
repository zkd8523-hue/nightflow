-- ============================================================================
-- Migration 199: 진행중 깃발의 마감 시각을 신규 정책(17시 오퍼 / 18:30 만료)으로 백필
-- 날짜: 2026-05-18
-- 설명:
--   Migration 170 도입 당시 정책은 "오퍼 15시(3시) + 검토 90분 → 16:30 만료"였으나
--   이후 정책이 "오퍼 17시(5시) + 검토 90분 → 18:30 만료"로 변경됨.
--   PuzzleForm.tsx의 신규 등록 로직은 이미 17:00/18:30 KST 기준으로 반영되어 있으나
--   변경 이전에 등록된 status IN ('open','selecting') 깃발들은 구 정책(15:00/16:30)이
--   DB에 박혀있어 새 정책과 불일치. 이번 마이그레이션으로 일괄 정렬.
--
--   대상: 아직 살아있는 깃발 (open/selecting) 만.
--        won/expired/matched/cancelled/accepted 등 종료 상태는 손대지 않음.
--
--   주의:
--     - event_date가 오늘이고 현재 시각이 17시 KST를 이미 지난 경우,
--       offer_deadline이 과거가 되어 다음 cron 실행 시 selecting으로 즉시 전환됨.
--       이는 정책상 정상 동작.
--     - 현재 시각이 18:30 KST도 이미 지났다면 expires_at도 과거가 되어 expired로 전환됨.
--       역시 정책상 정상 동작 (사실상 시간이 지난 깃발).
-- ============================================================================

UPDATE puzzles
SET
  offer_deadline = (event_date + INTERVAL '17 hours') AT TIME ZONE 'Asia/Seoul',
  expires_at     = (event_date + INTERVAL '18 hours 30 minutes') AT TIME ZONE 'Asia/Seoul',
  -- selecting 임박 알림 재발송 가능하도록 초기화 (selecting 단계 진입 후 다시 90분 잡힘)
  review_ending_notified_at = NULL
WHERE status IN ('open', 'selecting');
