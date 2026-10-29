-- ============================================================================
-- Migration 698: 파티에 누가 참가하면 방장에게 푸시
-- 날짜: 2026-10-30
--
-- 오퍼 도착(227/230)·파티 채팅(591)은 푸시가 나가는데, 참가만 인앱 알림
-- (in_app_notifications, join_puzzle 594)으로 끝나서 앱을 켜야만 알 수 있었다.
-- join_puzzle 전체를 다시 정의하지 않고 puzzle_members INSERT 트리거로 붙인다 —
-- 참가 경로가 늘어나도 한 곳에서 처리되고, 594의 성별·연령 검증을 건드리지 않는다.
--
-- 방장 본인 INSERT는 제외 — 조각 자동 발행(600)이 MD 본인을 멤버로 넣는다.
-- 카테고리 'party_member'는 can_send_push에 토글이 없어 항상 허용(ELSE TRUE),
-- 방해금지 시간만 적용된다. 파티 채팅의 'chat'과 같은 취급.
-- 푸시 실패가 참가 트랜잭션을 깨면 안 되므로 EXCEPTION으로 감싼다.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_puzzle_push_member_joined()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id UUID;
  v_status TEXT;
  v_user_name TEXT;
  v_body TEXT;
BEGIN
  SELECT leader_id, status INTO v_leader_id, v_status
  FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_leader_id IS NULL OR v_leader_id = NEW.user_id THEN RETURN NEW; END IF;
  IF v_status IN ('expired', 'cancelled') THEN RETURN NEW; END IF;

  -- 닉네임 우선 (Migration 548) — 다른 파티 함수와 동일한 폴백 순서
  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_user_name FROM users WHERE id = NEW.user_id;

  v_body := COALESCE(v_user_name, '회원') || '님이 파티에 참가했어요'
            || CASE WHEN COALESCE(NEW.guest_count, 0) > 0
                    THEN ' (일행 ' || NEW.guest_count::TEXT || '명 포함)' ELSE '' END;

  BEGIN
    PERFORM notify_user_push(
      v_leader_id,
      '🙌 새 파티원이 들어왔어요!',
      v_body,
      jsonb_build_object('type', 'party_member_joined', 'puzzle_id', NEW.puzzle_id::TEXT),
      '/party/' || NEW.puzzle_id::TEXT,
      'party_member'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'party_member_joined push failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS puzzle_push_member_joined ON puzzle_members;
CREATE TRIGGER puzzle_push_member_joined
  AFTER INSERT ON puzzle_members
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_push_member_joined();

COMMENT ON FUNCTION trg_puzzle_push_member_joined()
  IS '파티 참가 시 방장에게 FCM 푸시 (방장 본인 INSERT 제외, Migration 698)';
