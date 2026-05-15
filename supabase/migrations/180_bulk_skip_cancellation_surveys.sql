-- ============================================================================
-- Migration 179: 매치실패 설문 — 누적 미응답 일괄 스킵 RPC
-- 배경: 14일 이내 매치 실패 깃발이 여러 개 쌓이면, 응답할 때마다 다음 건이
--       또 떠서 사용자가 피로감 호소. "잘 모르겠어요"는 본인 의도를 명확히
--       표현한 것이므로, 누적된 미응답 건도 함께 no_answer로 마킹해 더 이상
--       반복되지 않도록 한다.
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_skip_pending_cancellation_surveys()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  WITH pending AS (
    SELECT
      p.id AS puzzle_id,
      CASE
        WHEN p.status = 'cancelled' THEN 'self_cancelled'::puzzle_survey_trigger
        ELSE 'selecting_expired'::puzzle_survey_trigger
      END AS trigger_type
    FROM puzzles p
    LEFT JOIN puzzle_cancellation_surveys s
      ON s.puzzle_id = p.id AND s.user_id = auth.uid()
    WHERE p.leader_id = auth.uid()
      AND s.id IS NULL
      AND COALESCE(p.cancelled_at, p.expires_at) > now() - INTERVAL '14 days'
      AND (
        (p.status = 'cancelled' AND p.cancelled_reason IS NULL)
        OR
        (p.status = 'expired' AND p.offer_deadline IS NOT NULL)
      )
  )
  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
  SELECT
    puzzle_id,
    auth.uid(),
    trigger_type,
    ARRAY['no_answer'::puzzle_cancel_reason],
    NULL
  FROM pending
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION bulk_skip_pending_cancellation_surveys() IS
  'Migration 179: 현재 사용자의 14일 이내 모든 미응답 매치실패 설문을 no_answer로 일괄 마킹. 처리된 건수 반환.';
