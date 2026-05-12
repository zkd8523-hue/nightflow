-- Migration 159: 찜한 퍼즐이 깃발로 승격될 때 찜한 모든 유저에게 인앱 알림
-- 트리거: puzzles UPDATE
--   - 직전 current_count < target_count → 현재 current_count >= target_count
--   - is_recruiting_party = true (퍼즐 → 깃발 승격만)
-- 알림 대상: puzzle_interests.user_id (방장 제외)
-- 알림 타입 신규: 'puzzle_promoted_to_flag'

-- 0) in_app_notifications type CHECK 확장
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
    'offer_withdrawn_by_admin'
  ));

-- 1) 트리거 함수
CREATE OR REPLACE FUNCTION notify_favorited_puzzle_promoted()
RETURNS TRIGGER AS $$
BEGIN
  -- 인원 충족으로 전환된 경우에만 (퍼즐 → 깃발 승격)
  IF NEW.is_recruiting_party = true
     AND OLD.current_count < OLD.target_count
     AND NEW.current_count >= NEW.target_count THEN

    -- 찜한 모든 유저에게 알림 (방장 본인 제외)
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT
      pi.user_id,
      'puzzle_promoted_to_flag',
      '찜한 퍼즐이 깃발로!',
      '찜한 퍼즐 인원이 다 모였어요. MD 시크릿 오퍼가 곧 도착해요.',
      '/flags/' || NEW.id
    FROM puzzle_interests pi
    WHERE pi.puzzle_id = NEW.id
      AND pi.user_id != NEW.leader_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) 트리거 등록 (있으면 교체)
DROP TRIGGER IF EXISTS trg_notify_favorited_puzzle_promoted ON puzzles;
CREATE TRIGGER trg_notify_favorited_puzzle_promoted
  AFTER UPDATE OF current_count ON puzzles
  FOR EACH ROW
  EXECUTE FUNCTION notify_favorited_puzzle_promoted();

COMMENT ON FUNCTION notify_favorited_puzzle_promoted() IS
  'Migration 159: 찜한 퍼즐 인원 충족 시 찜한 유저에게 인앱 알림 (방장 제외).';
