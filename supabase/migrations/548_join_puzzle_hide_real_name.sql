-- ============================================================================
-- Migration 548: 합류 시스템 메시지/알림에 실명이 노출되던 문제
-- 날짜: 2026-08-25
-- 배경:
--   단체채팅에 "김민기님이 합류했어요"처럼 실명이 그대로 찍혔다.
--   join_puzzle의 이름 폴백만 순서가 거꾸로다:
--     COALESCE(name, display_name)  ← 실명(name) 우선
--   Migration 108이 공개 식별자(display_name)와 실명(name)을 분리했고,
--   115가 MD 신뢰도 뷰에서 같은 누출을 이미 고쳤다. 다른 파티 함수
--   (kick/leave/offer/reaction 등)는 전부 display_name → name 순서인데
--   join_puzzle 계보(157 → 349 → 413 → 529)만 157의 원본 순서를 물려받았다.
--
--   처음 만나는 사람들이 모이는 방이라 실명 노출은 그대로 두면 안 된다.
--   폴백을 다른 함수와 동일하게 뒤집는다: display_name → name → '회원'
--   (닉네임 미설정 계정은 여전히 name으로 폴백되지만, 카카오 가입 시
--    display_name이 채워지므로 실무상 닉네임이 뜬다.)
--
--   529 본문 그대로 + 폴백 순서 한 줄 수정.
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

  -- 닉네임 우선 (Migration 548) — 다른 파티 함수와 동일한 폴백 순서
  v_user_name := COALESCE(NULLIF(v_u.display_name, ''), NULLIF(v_u.name, ''), '회원');

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

-- ----------------------------------------------------------------------------
-- 이미 실명으로 박혀버린 과거 시스템 메시지 정리
-- 메시지에는 sender_id가 없으므로(is_system은 sender_id NULL) 누구인지 역추적할 수
-- 없다. 실명이 남아있는 것보다 낫기에 닉네임이 다른 경우만 치환한다:
-- 같은 방 멤버 중 "name || '님이 합류했어요'" 와 정확히 일치하는 메시지를 찾아
-- 그 멤버의 display_name으로 바꾼다.
-- ----------------------------------------------------------------------------
UPDATE puzzle_party_messages m
SET content = u.display_name || '님이 합류했어요'
FROM puzzle_members pm
JOIN users u ON u.id = pm.user_id
WHERE m.is_system = TRUE
  AND m.puzzle_id = pm.puzzle_id
  AND NULLIF(u.display_name, '') IS NOT NULL
  AND NULLIF(u.name, '') IS NOT NULL
  AND u.display_name <> u.name
  AND m.content = u.name || '님이 합류했어요';
