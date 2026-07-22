-- 479: 조각 오퍼 마감을 20시 → 익일 새벽 3시로
--
-- 배경: 조각은 그날 밤 같이 놀 사람을 모으는 건데 저녁 8시에 오퍼가 닫히면
-- 정작 사람들이 움직이기 시작하는 시간대를 통째로 놓친다.
-- 깃발(is_recruiting_party = false)은 기존 20시/21시 유지.
--
-- 조각: 오퍼 마감 익일 03:00 KST → 검토 마감 익일 04:00 KST
-- 검토 창 60분은 깃발과 동일.
-- (신규 등록 자체는 밤 11시에 닫는다 — 클라이언트 getRegistrationDeadline. DB 무관)
--
-- Migration 297(전체 20시 이관)의 조각 한정 후속. 297과 동일한 방식으로
-- 진행 중인 행만 옮기고, 이미 지난 조각은 기록 보존을 위해 건드리지 않는다.
--
-- 신규 등록분은 클라이언트(src/lib/utils/puzzleDeadline.ts)가 처음부터
-- 새 시각으로 넣으므로 이 백필은 "이미 열려 있는 조각" 구제용이다.

UPDATE puzzles
SET offer_deadline = (event_date + INTERVAL '27 hours') AT TIME ZONE 'Asia/Seoul',
    expires_at     = (event_date + INTERVAL '28 hours') AT TIME ZONE 'Asia/Seoul',
    -- 마감이 미뤄졌으니 "검토 마감 임박" 알림을 다시 받을 수 있게 초기화
    review_ending_notified_at = NULL
WHERE status IN ('open', 'selecting')
  AND is_recruiting_party = true;
