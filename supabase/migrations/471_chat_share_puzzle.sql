-- ============================================================
-- Migration 471: 와글 채팅에 내 조각 공유
-- ------------------------------------------------------------
-- 유저가 조각(파티원 모집)을 구할 때, 대화 도중 바로 꺼내 붙일 수 있게 한다.
-- 진입점은 입력창의 "+" 첨부 메뉴 (사진/카메라/내 위치 옆에 "내 조각").
--
-- 구현 방식: FK 컬럼 + 카드 렌더 (파티방 shared_offer_id와 동일한 패턴).
--   media JSONB에 스냅샷으로 박으면 마이그레이션은 필요 없지만,
--   조각은 인원이 차오르고 마감되는 데이터라 이미 마감된 조각이
--   계속 "3/6 모집중"으로 떠 있게 된다. 그래서 FK로 실시간 참조한다.
--
-- 도배 제한: 일단 두지 않는다.
--   초기엔 와글에 콘텐츠가 부족한 게 더 큰 문제라, 모집 행동을 막지 않는다.
--   ⚠️ 다만 조각 카드는 본문이 빌 수 있어 기존 도배 규칙(1시간 내 동일 텍스트
--   차단, Migration 321)이 제대로 안 걸린다. 같은 조각 연속 도배가 보이면
--   여기에 쿨다운을 넣는다 (share_puzzle_to_chat 안에서 created_at 비교).
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

-- 1) 컬럼 -------------------------------------------------------
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS shared_puzzle_id UUID REFERENCES puzzles(id) ON DELETE SET NULL;

-- "이 조각이 이미 공유됐나" 조회 + 카드 렌더용
CREATE INDEX IF NOT EXISTS idx_chat_messages_shared_puzzle
  ON chat_messages (shared_puzzle_id)
  WHERE shared_puzzle_id IS NOT NULL;

COMMENT ON COLUMN chat_messages.shared_puzzle_id IS
  '와글에 공유한 조각. 카드로 렌더되며 탭하면 /flags/{id}.';

-- content CHECK 확장 (287) — 미디어처럼 조각 카드만 있어도 본문 0자 허용
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_content_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_content_check
  CHECK (
    char_length(content) <= 500
    AND (
      char_length(content) >= 1
      OR jsonb_array_length(media) >= 1
      OR shared_puzzle_id IS NOT NULL
    )
  );

-- 2) 공유 RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION share_puzzle_to_chat(
  p_room       TEXT,
  p_puzzle_id  UUID,
  p_content    TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_puzzle puzzles;
  v_msg_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없어요');
  END IF;

  -- 본인 조각만
  IF v_puzzle.leader_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', '내 조각만 공유할 수 있어요');
  END IF;

  -- 조각(파티원 모집)만. 깃발은 남이 합류할 수 있는 게 아니라 공유 의미가 없다
  IF NOT v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각만 공유할 수 있어요');
  END IF;

  -- 모집중인 것만
  IF v_puzzle.status NOT IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '모집 중인 조각만 공유할 수 있어요');
  END IF;

  INSERT INTO chat_messages (room, author_id, content, shared_puzzle_id)
    VALUES (p_room, v_uid, COALESCE(btrim(p_content), ''), p_puzzle_id)
    RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION share_puzzle_to_chat(TEXT, UUID, TEXT) TO authenticated;
