-- ============================================================================
-- Migration 451: 깃발 자가 취소 사유를 "필수" → "선택"으로 완화
-- 날짜: 2026-07-12
-- 설명:
--   Migration 198은 취소 시 사유 1개 이상을 강제했음. 그 결과 유저가
--   아무거나 눌러 내려버려 취소 사유 통계의 신빙성이 사라짐.
--
--   변경:
--     - 취소는 사유 없이도 즉시 가능 (사유/자유서술은 전적으로 선택)
--     - 사유를 하나도 남기지 않은 경우:
--         · cancelled_reason 을 NULL 로 두어 사후 설문(Migration 175)이
--           다음 접속 시 자연스럽게(저압) 다시 물어볼 수 있게 함
--         · puzzle_cancellation_surveys 에 빈 응답 행을 넣지 않음
--           → 통계는 "자발적으로 답한 사람"만 집계되어 신빙성 유지
--     - 'other' 선택 시 자유서술도 선택으로 완화(프론트와 정합)
--   그 외 취소 처리 로직은 Migration 198과 동일.
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_puzzle_with_reason(
  p_puzzle_id   UUID,
  p_reasons     puzzle_cancel_reason[],
  p_reason_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_has_reasons  BOOLEAN;
  v_text         TEXT;
  v_reason_store TEXT;
  v_area         TEXT;
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

  v_has_reasons := (p_reasons IS NOT NULL AND array_length(p_reasons, 1) IS NOT NULL);
  v_text        := NULLIF(trim(COALESCE(p_reason_text, '')), '');

  -- 자유서술 길이 제한 (테이블 CHECK와 정합)
  IF v_text IS NOT NULL AND char_length(v_text) > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', '사유는 300자 이내로 입력해주세요');
  END IF;

  -- cancelled_reason 저장값 결정:
  --   자유서술 우선 → 없으면 선택 사유 조인 → 둘 다 없으면 NULL(사후설문 재노출 허용)
  IF v_text IS NOT NULL THEN
    v_reason_store := v_text;
  ELSIF v_has_reasons THEN
    v_reason_store := array_to_string(p_reasons::TEXT[], ',');
  ELSE
    v_reason_store := NULL;
  END IF;

  -- 취소 처리 (cancel_puzzle Migration 167과 동일 + cancelled_reason 기록)
  UPDATE puzzles
  SET status           = 'cancelled',
      cancelled_at     = now(),
      cancelled_reason = v_reason_store
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

  -- 사유를 실제로 남긴 경우에만 설문 행 기록(자발적 응답만 통계 집계)
  --   · 기록 시 cancelled_reason 이 NOT NULL 이므로 사후 설문 트리거 차단됨
  --   · 미기록 시 cancelled_reason 이 NULL → 사후 설문(Migration 175)이 자연 재노출
  IF v_has_reasons OR v_text IS NOT NULL THEN
    INSERT INTO puzzle_cancellation_surveys
      (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
    VALUES
      (p_puzzle_id, v_uid, 'self_cancelled'::puzzle_survey_trigger,
       COALESCE(p_reasons, ARRAY[]::puzzle_cancel_reason[]), v_text)
    ON CONFLICT (puzzle_id, user_id) DO NOTHING;
  END IF;

  -- 영업 리드 반영(Migration 212 club_requests):
  --   "마음에 드는 클럽이 없어요" + 자유서술이 있으면 유저가 원한 클럽/지역을
  --   그대로 club_requests(영업 리드)에 적재해 admin/club-requests 에 즉시 노출.
  IF v_text IS NOT NULL AND 'no_preferred_venue' = ANY(p_reasons) THEN
    SELECT area INTO v_area FROM puzzles WHERE id = p_puzzle_id;
    INSERT INTO club_requests (user_id, club_name, area, note)
    VALUES (
      v_uid,
      left(v_text, 60),
      v_area,
      left('[깃발 취소] 원하는 클럽 없음 · ' || v_text, 200)
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION cancel_puzzle_with_reason(UUID, puzzle_cancel_reason[], TEXT) IS
  'Migration 451: 취소 즉시 가능, 사유/자유서술 선택. 자발적 응답만 설문 집계, 미응답 시 사후 설문 재노출. no_preferred_venue+서술은 club_requests(영업 리드)로 적재.';
