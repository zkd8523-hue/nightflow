-- ============================================================================
-- Migration 354: in_app_notifications.type CHECK에 조각 단체채팅 알림 타입 추가
-- 날짜: 2026-07-02
-- 설명:
--   - invite_md_to_party() → type='party_md_invited' (MD 단체방 초대)
--   - kick_party_member()  → type='party_removed'    (조각 추방)
--   Migration 292 목록 + 위 2개. (없으면 INSERT가 CHECK 위반으로 실패)
-- ============================================================================

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
    -- ▼ 조각 단체채팅 (Migration 352 / 350)
    'party_md_invited', 'party_removed'
  ));
