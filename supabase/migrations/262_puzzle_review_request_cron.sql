-- Migration 261: 매치 다음날 리뷰 요청 자동 알림 (pg_cron 14:00 KST)
-- 어제 또는 그 이전 event_date의 매치된(accepted) 깃발 중 리뷰 미작성인 건의 방장에게 1회 푸시.
-- 중복 방지: puzzles.review_requested_at 컬럼으로 발송 기록.

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_puzzles_review_request_queue
  ON puzzles (event_date, status)
  WHERE status = 'accepted' AND review_requested_at IS NULL;

-- ============================================================================
-- RPC: send_puzzle_review_requests
-- 매치 다음날 + 리뷰 미작성 + 발송 안된 깃발에게 일괄 발송.
-- pg_cron 또는 수동 호출 가능.
-- ============================================================================
CREATE OR REPLACE FUNCTION send_puzzle_review_requests()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_club_name TEXT;
  v_count INT := 0;
  v_cutoff DATE;
BEGIN
  -- KST 기준 어제 (오늘 14시 발송 = 어제 매치된 건)
  v_cutoff := (now() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day';

  FOR v_record IN
    SELECT
      p.id AS puzzle_id,
      p.leader_id,
      p.event_date,
      p.accepted_offer_id
    FROM puzzles p
    WHERE p.status = 'accepted'
      AND p.event_date <= v_cutoff
      AND p.review_requested_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_reviews r
        WHERE r.puzzle_id = p.id AND r.leader_id = p.leader_id
      )
    ORDER BY p.event_date DESC
    LIMIT 500
  LOOP
    -- 클럽명 조회 (있으면 본문에 노출)
    SELECT c.name INTO v_club_name
    FROM puzzle_offers o
    LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = v_record.accepted_offer_id;

    PERFORM notify_user_push(
      v_record.leader_id,
      CASE
        WHEN v_club_name IS NOT NULL THEN v_club_name || ' 어떠셨어요? ⭐'
        ELSE '지난번 매치 어떠셨어요? ⭐'
      END,
      '한마디 남겨주시면 MD와 다음 방문자에게 큰 도움이 돼요',
      jsonb_build_object('puzzle_id', v_record.puzzle_id, 'type', 'review_request'),
      '/flags/' || v_record.puzzle_id || '/review',
      'review_request'
    );

    UPDATE puzzles SET review_requested_at = now() WHERE id = v_record.puzzle_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION send_puzzle_review_requests() TO service_role;

COMMENT ON FUNCTION send_puzzle_review_requests() IS
  '매치 다음날 리뷰 요청 알림 일괄 발송 (pg_cron 매일 14:00 KST). 리뷰 작성된 건은 자동 제외.';

-- ============================================================================
-- pg_cron 스케줄 (매일 14:00 KST = 05:00 UTC)
-- ============================================================================
DO $$
BEGIN
  -- 기존 잡 제거 (재실행 안전)
  PERFORM cron.unschedule('puzzle-review-requests-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'puzzle-review-requests-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'puzzle-review-requests-daily',
  '0 5 * * *',  -- UTC 05:00 = KST 14:00
  $$SELECT send_puzzle_review_requests();$$
);
