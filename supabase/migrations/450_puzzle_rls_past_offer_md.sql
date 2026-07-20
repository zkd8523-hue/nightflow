-- ============================================================================
-- Migration 450: puzzles RLS — 지난(만료/거절/철회) 오퍼 MD도 본인 오퍼 깃발 SELECT 허용
-- 날짜: 2026-07-10
-- 문제: Migration 265 정책은 비방장 MD에게 오퍼 status가 pending/accepted일 때만
--       깃발 SELECT를 허용. 방장이 다른 MD를 수락하면 나머지 오퍼는 expired가 되고
--       깃발 status도 open/selecting을 벗어나므로(accepted 등), 탈락한 MD는 puzzles
--       RLS에 걸려 puzzle이 null 로 온다.
--       그런데 채팅 목록(get_offer_chats)은 SECURITY DEFINER 라 RLS를 우회하고
--       "메시지가 1건이라도 있으면" 계속 노출 → "목록엔 보이는데 채팅방을 열면 404"
--       (messages/[offerId]/page.tsx 의 puzzle null → notFound()) 가 발생한다.
--       메시지 읽기 정책("offer participants access messages", 332)도 내부에서
--       puzzles 를 JOIN 하므로 같은 이유로 메시지까지 안 보인다.
-- 해결: MD 조건에서 오퍼 status 필터를 제거한다. 그 깃발에 한 번이라도 오퍼를 넣은
--       MD는 상태와 무관하게 해당 깃발을 SELECT 할 수 있어, 채팅방 진입 + 종료된
--       대화 읽기전용 열람이 모두 복구된다. (방장/공개/admin 분기는 그대로 유지)
-- 참조: 정책 변천 097 → 137 → 148 → 265 → (본 마이그레이션) 450
-- ============================================================================

DROP POLICY IF EXISTS "View puzzles" ON puzzles;

CREATE POLICY "View puzzles" ON puzzles
  FOR SELECT USING (
    status IN ('open', 'selecting')
    OR leader_id = auth.uid()
    OR id IN (
      SELECT puzzle_id FROM puzzle_offers
      WHERE md_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON POLICY "View puzzles" ON puzzles IS
  'open/selecting 깃발은 누구나, leader는 본인 깃발, 오퍼를 넣은 MD는 상태 무관(종료 후 채팅 열람 포함), admin은 모든 깃발 SELECT 가능.';
