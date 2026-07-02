-- ============================================================================
-- Migration 351: 조각 단체채팅 안읽음 카운트 (카톡식 "N")
-- 날짜: 2026-07-02
-- 설명:
--   메시지별로 아직 안 읽은 참여자 수를 계산할 수 있게 멤버 전원의 읽음 포인터를
--   참여자에게 노출(get_party_read_state) + 읽음 포인터 실시간 반영.
--   ADDITIVE (RPC 추가 + realtime publication).
-- ============================================================================

-- 읽음 포인터 실시간 (내가 방을 열면 다른 사람 화면의 "N"이 줄어들도록)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_party_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE puzzle_party_reads;
  END IF;
END $$;

-- 참여자 전원의 읽음 시각 (참여자만 조회 가능)
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
    AND is_party_participant(p_puzzle_id, auth.uid());
$$;
GRANT EXECUTE ON FUNCTION get_party_read_state(UUID) TO authenticated;
