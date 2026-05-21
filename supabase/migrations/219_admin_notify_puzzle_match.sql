-- ============================================================================
-- Migration 219: admin 알림 (깃발/매치 만료·취소)
-- 날짜: 2026-05-22
-- 설명:
--   admin(users.role='admin')이 깃발 만료/취소, 수락된 매치(accepted offer)
--   만료/취소 이벤트를 인앱 알림으로 받을 수 있도록 추가.
--
--   포함 케이스 (사용자 확인 완료):
--     - 깃발 만료: expire-puzzles Edge Function 경유 (Edge에서 별도 INSERT)
--     - 깃발 자가 취소: cancel_puzzle_with_reason() — 본 마이그레이션에서 처리
--     - 매치 만료: 깃발 만료 시 accepted offer가 같이 expired되는 케이스 (Edge에서 처리)
--     - 매치 자가 취소: 방장 자가 취소 + accepted_offer_id가 있던 경우
--
--   제외 케이스:
--     - admin 강제 취소(admin_cancel_puzzle_*) — admin 본인 행동이라 불필요
--     - MD 오퍼 자진 철회(withdraw_offer)
--     - admin 오퍼 강제 철회(admin_withdraw_offer)
--
--   수신자: users.role='admin' 인 모든 계정
-- ============================================================================

-- 1) in_app_notifications type CHECK 확장
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;
ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
    'md_approved', 'md_rejected', 'outbid', 'auction_won',
    'contact_deadline_warning', 'noshow_penalty', 'fallback_won',
    'feedback_request', 'md_grade_change', 'cancellation_confirmed',
    'contact_expired_no_fault', 'contact_expired_user_attempted',
    'md_winner_cancelled', 'md_winner_noshow', 'md_new_bid',
    'md_noshow_review', 'noshow_dismissed',
    'puzzle_seat_adjusted', 'puzzle_cancelled',
    'puzzle_offer_received', 'puzzle_offer_accepted', 'puzzle_offer_rejected',
    'puzzle_leader_changed', 'puzzle_member_joined',
    'puzzle_visit_pending', 'puzzle_visit_confirmed',
    'puzzle_promoted_to_flag',
    'offer_withdrawn_by_admin',
    -- ▼ admin 전용 알림 (Migration 219)
    'admin_puzzle_expired', 'admin_puzzle_cancelled',
    'admin_match_expired', 'admin_match_cancelled'
  ));

-- 2) admin 알림 헬퍼: 모든 admin 계정에 동일 알림을 INSERT
CREATE OR REPLACE FUNCTION notify_admins(
  p_type       TEXT,
  p_title      TEXT,
  p_message    TEXT,
  p_action_url TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT u.id, p_type, p_title, p_message, p_action_url
  FROM users u
  WHERE u.role = 'admin'
    AND u.deleted_at IS NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION notify_admins(TEXT, TEXT, TEXT, TEXT) IS
  'Migration 219: 모든 admin(users.role=admin)에게 인앱 알림을 일괄 INSERT 한다.';

-- 3) cancel_puzzle_with_reason() 재정의 — 방장 자가 취소 경로에 admin 알림 추가
--    198번의 본문을 보존하면서, 마지막에 admin 알림 INSERT 추가.
CREATE OR REPLACE FUNCTION cancel_puzzle_with_reason(
  p_puzzle_id   UUID,
  p_reasons     puzzle_cancel_reason[],
  p_reason_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_puzzle     puzzles%ROWTYPE;
  v_match_md   UUID;
  v_area       TEXT;
  v_event_date DATE;
  v_label      TEXT;
BEGIN
  -- 권한: 방장 본인
  IF NOT EXISTS (
    SELECT 1 FROM puzzles
    WHERE id = p_puzzle_id AND leader_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  -- 상태: open 만 허용
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

  -- 자유서술 길이 제한
  IF p_reason_text IS NOT NULL AND char_length(p_reason_text) > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', '사유는 300자 이내로 입력해주세요');
  END IF;

  -- 취소 처리
  UPDATE puzzles
  SET status           = 'cancelled',
      cancelled_at     = now(),
      cancelled_reason = COALESCE(NULLIF(trim(COALESCE(p_reason_text, '')), ''),
                                  array_to_string(p_reasons::TEXT[], ','))
  WHERE id = p_puzzle_id
  RETURNING * INTO v_puzzle;

  v_area       := v_puzzle.area;
  v_event_date := v_puzzle.event_date;

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

  -- 사유 저장
  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
  VALUES
    (p_puzzle_id, v_uid, 'self_cancelled'::puzzle_survey_trigger,
     p_reasons, NULLIF(trim(COALESCE(p_reason_text, '')), ''))
  ON CONFLICT (puzzle_id, user_id) DO NOTHING;

  -- ▼ admin 알림 (Migration 219)
  v_label := COALESCE(v_area, '지역?') || ' '
             || COALESCE(to_char(v_event_date, 'MM/DD'), '');

  PERFORM notify_admins(
    'admin_puzzle_cancelled',
    '[관리자] 깃발 취소',
    '방장이 깃발을 취소했습니다 — ' || v_label,
    '/admin/puzzles'
  );

  -- 매치 성사(accepted offer)였던 경우 매치 취소 알림도 추가
  IF v_puzzle.accepted_offer_id IS NOT NULL THEN
    SELECT md_id INTO v_match_md
    FROM puzzle_offers
    WHERE id = v_puzzle.accepted_offer_id;

    PERFORM notify_admins(
      'admin_match_cancelled',
      '[관리자] 매치 취소',
      '수락된 매치가 방장 취소로 종료되었습니다 — ' || v_label,
      '/admin/puzzles'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION cancel_puzzle_with_reason(UUID, puzzle_cancel_reason[], TEXT) IS
  'Migration 219: 방장 자가 취소 + admin 알림 추가. 198번 본문 보존.';
