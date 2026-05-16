-- Migration 176: 깃발 승격 알림 멘트를 MD 수신자 기준으로 교체
-- 배경: Migration 159의 메시지가 유저(방장) 시점("오퍼가 곧 도착")으로 쓰여 있으나
--      알림(찜) 기능은 MD 전용이므로 MD 액션 유도 멘트로 정렬

CREATE OR REPLACE FUNCTION notify_favorited_puzzle_promoted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recruiting_party = true
     AND OLD.current_count < OLD.target_count
     AND NEW.current_count >= NEW.target_count THEN

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT
      pi.user_id,
      'puzzle_promoted_to_flag',
      '🚩 깃발 떴어요!',
      '주시하던 퍼즐 인원이 다 찼어요. 지금 시크릿 오퍼 보낼 타이밍!',
      '/flags/' || NEW.id
    FROM puzzle_interests pi
    WHERE pi.puzzle_id = NEW.id
      AND pi.user_id != NEW.leader_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_favorited_puzzle_promoted() IS
  'Migration 176: MD 수신자 시점으로 멘트 갱신 — 깃발 승격 시 시크릿 오퍼 액션 호명.';
