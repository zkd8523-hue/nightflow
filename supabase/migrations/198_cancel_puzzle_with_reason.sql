-- ============================================================================
-- Migration 198: 방장 자가 취소 시 사유 수집 (사전 마찰)
-- 날짜: 2026-05-19
-- 설명:
--   현재 cancel_puzzle()은 confirm() 한 번으로 즉시 취소되어
--   충동 취소가 많고 "왜 죽었는지" 데이터가 없음. 사후 설문(175/177/195)은
--   다음 접속 시점에 노출되어 응답률이 낮음.
--
--   해결: 취소 시점에 사유 수집(복수선택)을 강제하는 새 RPC 추가.
--     - 기존 cancel_puzzle()은 admin/하위호환을 위해 보존
--     - cancel_puzzle_with_reason()이 동일 작업 + 사유 저장 + 사후 설문 트리거 차단
--   추가: puzzle_cancel_reason ENUM에 'booked_elsewhere' 추가
-- ============================================================================

-- 1) ENUM 확장: 'booked_elsewhere' (다른 곳에서 예약했어요)
ALTER TYPE puzzle_cancel_reason ADD VALUE IF NOT EXISTS 'booked_elsewhere';

-- 2) 새 RPC: 방장 자가 취소 + 사유 동시 기록
CREATE OR REPLACE FUNCTION cancel_puzzle_with_reason(
  p_puzzle_id   UUID,
  p_reasons     puzzle_cancel_reason[],
  p_reason_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- 권한: 방장 본인
  IF NOT EXISTS (
    SELECT 1 FROM puzzles
    WHERE id = p_puzzle_id AND leader_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  -- 상태: open 만 허용 (cancel_puzzle과 동일)
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 깃발입니다');
  END IF;

  -- 사유 1개 이상 필수
  IF p_reasons IS NULL OR array_length(p_reasons, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '사유를 하나 이상 선택해주세요');
  END IF;

  -- 'other' 선택 시 자유서술 필수
  IF 'other' = ANY(p_reasons) AND (p_reason_text IS NULL OR trim(p_reason_text) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', '기타 선택 시 내용을 입력해주세요');
  END IF;

  -- 자유서술 길이 제한 (테이블 CHECK와 정합)
  IF p_reason_text IS NOT NULL AND char_length(p_reason_text) > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', '사유는 300자 이내로 입력해주세요');
  END IF;

  -- 취소 처리 (cancel_puzzle Migration 167과 동일 + cancelled_reason 기록)
  UPDATE puzzles
  SET status           = 'cancelled',
      cancelled_at     = now(),
      cancelled_reason = COALESCE(NULLIF(trim(COALESCE(p_reason_text, '')), ''),
                                  array_to_string(p_reasons::TEXT[], ','))
  WHERE id = p_puzzle_id;

  -- 참여자 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', '참여하신 깃발이 내려갔습니다.',
         '/flags/' || p_puzzle_id
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id != v_uid;

  -- pending 오퍼 만료 + MD 활성 카운트 감소
  UPDATE puzzle_offers SET status = 'expired', updated_at = now()
  WHERE puzzle_id = p_puzzle_id AND status = 'pending';

  UPDATE users SET md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND status = 'expired'
  );

  -- 사유 저장 (사후 설문 트리거 차단을 위해 직접 INSERT)
  -- 사후 설문은 cancelled_reason IS NULL 일 때만 노출됨 (Migration 175 get_pending_cancellation_survey)
  -- → cancelled_reason 을 위에서 NOT NULL로 세팅했으므로 자동 차단됨
  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
  VALUES
    (p_puzzle_id, v_uid, 'self_cancelled'::puzzle_survey_trigger,
     p_reasons, NULLIF(trim(COALESCE(p_reason_text, '')), ''))
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION cancel_puzzle_with_reason(UUID, puzzle_cancel_reason[], TEXT) IS
  'Migration 198: 방장 자가 취소 + 사유 동시 기록 (사전 마찰). cancelled_reason 세팅으로 사후 설문 트리거 자동 차단.';

-- 3) admin_puzzle_cancellation_stats 재정의: booked_elsewhere 라벨 추가 + 신규 라벨 반영
-- Migration 177의 UNNEST 기반 집계 구조와 ratio 의미(응답자 대비 선택 비율)를 보존.
CREATE OR REPLACE FUNCTION admin_puzzle_cancellation_stats(
  p_from    DATE DEFAULT (now() - INTERVAL '30 days')::DATE,
  p_to      DATE DEFAULT now()::DATE,
  p_trigger TEXT DEFAULT NULL
)
RETURNS TABLE (
  reason_category TEXT,
  label           TEXT,
  cnt             BIGINT,
  ratio           NUMERIC
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH exploded AS (
    SELECT UNNEST(reason_categories) AS reason_category
    FROM puzzle_cancellation_surveys
    WHERE responded_at::DATE BETWEEN p_from AND p_to
      AND (p_trigger IS NULL OR trigger_type::TEXT = p_trigger)
  ),
  total_responses AS (
    SELECT COUNT(*) AS total
    FROM puzzle_cancellation_surveys
    WHERE responded_at::DATE BETWEEN p_from AND p_to
      AND (p_trigger IS NULL OR trigger_type::TEXT = p_trigger)
  ),
  grouped AS (
    SELECT reason_category::TEXT, COUNT(*) AS cnt
    FROM exploded
    GROUP BY reason_category
  )
  SELECT
    g.reason_category,
    CASE g.reason_category
      WHEN 'schedule_change'    THEN '일정·약속이 변경되었어요'
      WHEN 'no_preferred_venue' THEN '마음에 드는 클럽이 없어요'
      WHEN 'weak_offers'        THEN '옵션이 마음에 들지 않아요'
      WHEN 'booked_elsewhere'   THEN '다른 곳에서 예약했어요'
      WHEN 'mind_change'        THEN '단순변심'
      WHEN 'forgot_about_it'    THEN '잊어버렸어요'
      WHEN 'other'              THEN '기타'
      WHEN 'no_answer'          THEN '잘 모르겠어요'
    END AS label,
    g.cnt,
    CASE WHEN t.total = 0 THEN 0
         ELSE ROUND(g.cnt::NUMERIC / t.total * 100, 1)
    END AS ratio
  FROM grouped g
  CROSS JOIN total_responses t
  ORDER BY g.cnt DESC;
$$;

COMMENT ON FUNCTION admin_puzzle_cancellation_stats(DATE, DATE, TEXT) IS
  'Migration 198: booked_elsewhere 라벨 추가 + 신규 UI 라벨 반영.';
