-- ============================================================================
-- Migration 195: 매치실패 설문 — 응답 1건 제출 시 동일 trigger 잔여건 자동 마킹
-- 배경: 175/177에서 응답 시 1건만 INSERT. 14일 이내 매치 실패가 누적된 사용자는
--       응답할 때마다 다음 건이 또 떠서 피로감 호소. "잘 모르겠어요"(180)는
--       이미 일괄 처리되지만, 성실히 답한 사용자가 더 손해 보는 역구조.
-- 해결: 동일 trigger_type의 14일 이내 미응답 건도 같은 사유로 함께 마킹.
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_cancellation_survey(
  p_puzzle_id         UUID,
  p_reason_categories puzzle_cancel_reason[],
  p_reason_text       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trigger puzzle_survey_trigger;
BEGIN
  -- 본인 깃발인지 검증
  SELECT
    CASE
      WHEN status = 'cancelled' THEN 'self_cancelled'::puzzle_survey_trigger
      ELSE 'selecting_expired'::puzzle_survey_trigger
    END
  INTO v_trigger
  FROM puzzles
  WHERE id = p_puzzle_id AND leader_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 깃발에 대한 설문 권한이 없습니다';
  END IF;

  -- 최소 1개 필요
  IF p_reason_categories IS NULL OR array_length(p_reason_categories, 1) IS NULL THEN
    RAISE EXCEPTION '사유를 하나 이상 선택해주세요';
  END IF;

  -- 'other' 포함 시 자유서술 필수
  IF 'other' = ANY(p_reason_categories) AND (p_reason_text IS NULL OR trim(p_reason_text) = '') THEN
    RAISE EXCEPTION '기타 선택 시 내용을 입력해주세요';
  END IF;

  -- 본 응답 + 동일 trigger_type의 14일 이내 잔여 미응답 건을 함께 INSERT
  -- (성실 응답자가 1건만 답하고 끝낼 수 있도록 자동 일괄 마킹)
  -- 'other'의 자유서술은 잔여건에 복사하지 않음(원본 깃발 문맥에서 작성된 글이므로)
  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
  SELECT
    target_id,
    auth.uid(),
    v_trigger,
    p_reason_categories,
    CASE WHEN target_id = p_puzzle_id THEN p_reason_text ELSE NULL END
  FROM (
    SELECT p_puzzle_id AS target_id
    UNION
    SELECT p.id
    FROM puzzles p
    LEFT JOIN puzzle_cancellation_surveys s
      ON s.puzzle_id = p.id AND s.user_id = auth.uid()
    WHERE p.leader_id = auth.uid()
      AND p.id <> p_puzzle_id
      AND s.id IS NULL
      AND COALESCE(p.cancelled_at, p.expires_at) > now() - INTERVAL '14 days'
      AND (
        (v_trigger = 'self_cancelled'
          AND p.status = 'cancelled' AND p.cancelled_reason IS NULL)
        OR
        (v_trigger = 'selecting_expired'
          AND p.status = 'expired' AND p.offer_deadline IS NOT NULL)
      )
  ) targets
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION submit_cancellation_survey(UUID, puzzle_cancel_reason[], TEXT) IS
  'Migration 195: 본 응답 + 동일 trigger_type의 14일 이내 미응답 건을 같은 사유로 자동 일괄 마킹. reason_text는 원본 깃발에만 저장.';
