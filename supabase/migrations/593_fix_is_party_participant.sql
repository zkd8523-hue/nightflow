-- ============================================================================
-- Migration 593: is_party_participant — 파트너(MD) 조건 누락 복구
-- 날짜: 2026-08-27
-- 배경:
--   실제 라이브 DB에서 is_party_participant()를 직접 호출해 확인한 결과,
--   초대된 파트너(puzzle_party_md에 행이 존재)에 대해 false를 반환했다.
--   puzzle_party_md 행 자체는 정상 존재하고 RLS로도 읽히는데(Migration 590 정상
--   작동 확인), 이 함수만 방장/멤버 조건만 보고 파트너 조건이 빠진 예전 버전이
--   배포돼 있었다 — 이번 다중 파트너 작업(588~592)과 무관하게 이전부터 있던
--   배포 누락이다.
--
--   이 함수가 잘못 판정하면서 연쇄적으로 아래가 전부 깨졌다:
--     - get_party_chats(): is_party_participant가 false → 파트너 목록에서
--       파티가 아예 안 보임 ("초대했는데 채팅방이 안 만들어졌다"의 실제 원인)
--     - send_party_message / share_offer_to_party: is_party_participant를
--       거치는 경로가 있다면 파트너가 메시지를 못 보낼 수 있음
--     - 기타 이 함수에 의존하는 모든 RLS/RPC
--
--   CREATE OR REPLACE로 확실하게 덮어쓴다(이전 상태가 무엇이었든 무관하게 정상화).
-- ============================================================================

CREATE OR REPLACE FUNCTION is_party_participant(p_puzzle_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_party_participant(UUID, UUID) TO authenticated, anon;
