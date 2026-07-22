-- ============================================================================
-- Migration 481: 크레딧 적립 완료 인앱 알림
-- ----------------------------------------------------------------------------
-- 배경: 계좌이체 크레딧 충전(480)에서 관리자가 [적립]을 눌러도 MD에게는
--   푸시 알림만 갔고, 앱 안에서 "적립됐다"는 안내(팝업/알림함)가 없었다.
--   in_app_notifications 에 'credit_charged' 타입을 추가하고, 적립 트리거에서
--   INSERT 하도록 확장한다. 프론트(useNotifications)가 이 알림을 감지해
--   축하 팝업을 띄운다.
-- ============================================================================

-- 1) type CHECK 제약 확장 -----------------------------------------------------
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
    'admin_puzzle_expired', 'admin_puzzle_cancelled',
    'admin_match_expired', 'admin_match_cancelled',
    'chat_reply',
    'party_md_invited', 'party_removed', 'party_md_released',
    'dm_request', 'dm_accepted',
    'credit_charged'
  ));

-- 2) 적립 완료 시 in_app_notifications INSERT (기존 푸시 트리거 확장) --------
-- 480 에서 만든 notify_md_bank_credit_confirmed() 를 재정의하여 인앱 알림도 함께 남긴다.
CREATE OR REPLACE FUNCTION notify_md_bank_credit_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.method = 'bank_transfer'
     AND NEW.status = 'paid'
     AND COALESCE(OLD.status, '') <> 'paid' THEN

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.md_id,
      'credit_charged',
      '✅ 크레딧 적립 완료',
      NEW.credits || '크레딧이 충전되었습니다.',
      '/md/credits'
    );

    PERFORM notify_user_push(
      NEW.md_id,
      '✅ 크레딧 충전 완료',
      NEW.credits || '크레딧이 충전되었습니다.',
      jsonb_build_object('type', 'credit_charged', 'payment_id', NEW.payment_id),
      '/md/credits',
      'transaction'
    );
  END IF;
  RETURN NEW;
END;
$$;
