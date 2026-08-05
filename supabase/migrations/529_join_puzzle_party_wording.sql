-- ============================================================================
-- Migration 529: join_puzzle 문구를 "조각" → "파티"로
-- 날짜: 2026-08-05
-- 배경:
--   "조각"은 테이블을 쪼갠다는 공급자 언어라 저가 이미지가 붙어 서비스 전반에서
--   "파티"로 통일했다(UI 83개 파일). 그런데 참가 실패 토스트는 DB 함수가 만들어
--   "본인이 만든 조각입니다"가 그대로 노출된다.
--
--   413(퍼즐 → 조각)이 프로덕션에 적용되지 않은 정황도 있어(여전히 "퍼즐" 문구가
--   목격됨) 이 마이그레이션이 그 최신본을 대체한다. 413을 따로 적용할 필요 없다.
--   로직은 그대로, 문구만 바뀐다.
-- ============================================================================

CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
  v_u users%ROWTYPE;
  v_user_name TEXT;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  SELECT * INTO v_u FROM users WHERE id = auth.uid();

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '파티를 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 파티입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 파티입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 파티입니다');
  END IF;
  -- 추방 이력 → 재합류 차단
  IF EXISTS (SELECT 1 FROM puzzle_kicks WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 파티에서 내보내져 다시 합류할 수 없어요');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  v_user_name := COALESCE(NULLIF(v_u.name, ''), NULLIF(v_u.display_name, ''), '회원');

  -- 단체채팅 시스템 메시지 + 합류자 본인 읽음 초기화
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 합류했어요', TRUE);
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
    VALUES (p_puzzle_id, auth.uid(), now())
    ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_user_name || '님이 파티에 참여했습니다. 인원을 확인해보세요!',
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
