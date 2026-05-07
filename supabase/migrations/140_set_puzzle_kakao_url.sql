-- ============================================================================
-- Migration 140: set_puzzle_kakao_url() — 수락된 깃발에 방장 오픈채팅 URL 등록
-- 날짜: 2026-05-08
-- 설명:
--   Migration 139에서 accept_offer가 URL 없이도 수락되도록 변경됨.
--   수락 후(연락처 공개 단계)에서 방장이 본인 노출이 부담될 경우
--   오픈채팅 링크를 별도로 등록할 수 있는 후속 RPC.
--
--   - 방장만 호출 가능, 수락된 상태(status='accepted')에서만 동작
--   - URL 형식 검증
--   - 수락된 MD에게 'puzzle_kakao_url_set' 알림 발송
--     (accept_offer 시점엔 "직접 연락" 안내였더라도, 이 알림으로 갱신됨)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_puzzle_kakao_url(
  p_puzzle_id UUID,
  p_kakao_open_chat_url TEXT
) RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
BEGIN
  IF p_kakao_open_chat_url IS NULL
     OR p_kakao_open_chat_url !~ '^https://open\.kakao\.com/o/' THEN
    RETURN jsonb_build_object('success', false, 'error', '올바른 카카오 오픈채팅 링크 형식이 아닙니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 설정할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 깃발에서만 설정할 수 있습니다');
  END IF;

  UPDATE puzzles
  SET kakao_open_chat_url = p_kakao_open_chat_url
  WHERE id = p_puzzle_id;

  -- 수락된 MD에게 오픈채팅 URL 공유 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT
    md_id,
    'puzzle_kakao_url_set',
    '오픈채팅 링크 도착',
    '방장이 오픈채팅 링크를 공유했습니다. 입장해 예약을 확정하세요.',
    '/flags/' || p_puzzle_id
  FROM puzzle_offers
  WHERE puzzle_id = p_puzzle_id AND status = 'accepted';

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', p_kakao_open_chat_url
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
