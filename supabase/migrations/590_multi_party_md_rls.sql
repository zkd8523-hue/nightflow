-- ============================================================================
-- Migration 590: 다중 파트너(MD) 파티 채팅 — Phase 2 RLS 격리
-- 날짜: 2026-08-27
-- 배경:
--   Phase 1에서 파티당 여러 파트너 행이 허용됐다. 이제 각 파트너가
--   자기 방만 보고, 서로의 존재조차 모르게 격리해야 한다(시크릿 오퍼 원칙).
--
--   is_party_participant는 "방장 OR 멤버 OR 초대된 MD 본인"을 묶어서
--   판정하는 이진 함수라 방(room) 단위 격리에 못 쓴다(ELSE 분기가 안 갈린다).
--   그래서 is_party_member(MD 제외)와 can_see_party_room(방별 판정)을 새로 만든다.
--
--   격리 표:
--     |            | 파티원방 | MD A 방 | MD B 방 |
--     | 방장·파티원 |   ✅    |   ✅   |   ✅   |
--     | MD A       |   ❌    |   ✅   |   ❌   |
--     | MD B       |   ❌    |   ❌   |   ✅   |
--
--   ⭐ puzzle_party_md 자체의 SELECT 정책도 반드시 고쳐야 한다 —
--   안 고치면 칩 UI 이전에 "누가 초대돼 있는지" 명단 자체가 다른 MD에게 샌다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) is_party_member: 방장·멤버만 (MD 분기 없음)
--    is_party_participant의 ELSE 팔로는 못 쓴다 — 그쪽은 MD도 참이 되므로.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_party_member(p_puzzle_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = p_user_id)
      OR EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id);
$$;

GRANT EXECUTE ON FUNCTION is_party_member(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) can_see_party_room: 방(room_md_id) 단위 판정
--    - 그 파티에 초대된 MD 본인이면: 자기 방(room_md_id = 자기 id)만 참
--    - 그 외(방장·멤버)면: 파티원방(NULL) + 모든 MD 방 전부 참
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_see_party_room(p_puzzle_id UUID, p_room_md_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_user_id)
      THEN p_room_md_id = p_user_id
    ELSE is_party_member(p_puzzle_id, p_user_id)
  END;
$$;

GRANT EXECUTE ON FUNCTION can_see_party_room(UUID, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) puzzle_party_messages 정책 교체 (349:49-58 대체)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "party participants read messages" ON puzzle_party_messages;
CREATE POLICY "party participants read messages" ON puzzle_party_messages
  FOR SELECT USING (can_see_party_room(puzzle_id, room_md_id, auth.uid()));

DROP POLICY IF EXISTS "party participants insert messages" ON puzzle_party_messages;
CREATE POLICY "party participants insert messages" ON puzzle_party_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND can_see_party_room(puzzle_id, room_md_id, auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4) ⭐ puzzle_party_md 자체의 SELECT 정책 (352:39-41 대체)
--    이걸 안 고치면 MD A가 puzzle_party_md를 조회해 MD B의 존재를 알 수 있다.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "party md readable by participants" ON puzzle_party_md;
CREATE POLICY "party md readable by participants" ON puzzle_party_md
  FOR SELECT USING (is_party_member(puzzle_id, auth.uid()) OR md_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) puzzle_party_reactions 정책 3개 교체 (362:24-45 대체)
--    메시지를 조인해 room_md_id를 얻어 같은 술어를 쓴다.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "party react read" ON puzzle_party_reactions;
CREATE POLICY "party react read" ON puzzle_party_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM puzzle_party_messages m
      WHERE m.id = puzzle_party_reactions.message_id
        AND can_see_party_room(m.puzzle_id, m.room_md_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "party react write" ON puzzle_party_reactions;
CREATE POLICY "party react write" ON puzzle_party_reactions
  FOR ALL USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM puzzle_party_messages m
      WHERE m.id = puzzle_party_reactions.message_id
        AND can_see_party_room(m.puzzle_id, m.room_md_id, auth.uid())
    )
  ) WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM puzzle_party_messages m
      WHERE m.id = puzzle_party_reactions.message_id
        AND can_see_party_room(m.puzzle_id, m.room_md_id, auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 6) get_party_read_state: 방 필터링 추가 (351:22-34 대체)
--    안 고치면 MD A가 MD B의 읽음 시각을 보고 다른 파트너의 존재를 추론할 수 있다.
--    puzzle_party_reads엔 room 개념이 없으므로(파티 단위 유일), 호출자 기준으로
--    "자신이 볼 수 있는 방에 실제로 참여하는 유저"의 읽음만 돌려준다.
--      - 방장·멤버가 호출: 방장·멤버 전원 + 초대된 MD 전원 (자신은 모든 방을 보므로)
--      - MD가 호출: 방장·멤버 전원 + 자기 자신만 (다른 MD의 읽음은 절대 안 보임)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_party_read_state(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('user_id', r.user_id, 'last_read_at', r.last_read_at)),
    '[]'::jsonb
  )
  FROM puzzle_party_reads r
  WHERE r.puzzle_id = p_puzzle_id
    AND (
      is_party_member(p_puzzle_id, auth.uid())
      OR EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid())
    )
    AND (
      -- 방장·멤버의 읽음은 누구에게나(호출자가 참여자라면) 노출
      is_party_member(p_puzzle_id, r.user_id)
      -- MD의 읽음은: 호출자가 방장·멤버(모든 방을 봄)이거나, 호출자 본인일 때만
      OR (
        EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = r.user_id)
        AND (is_party_member(p_puzzle_id, auth.uid()) OR r.user_id = auth.uid())
      )
    );
$$;

GRANT EXECUTE ON FUNCTION get_party_read_state(UUID) TO authenticated;
