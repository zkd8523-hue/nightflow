-- 429: 종료된 MD 직통 조각을 MD 대시보드에서 숨기기
-- 배경: cancel_puzzle_with_reason()은 status='open'만 취소 가능 →
--   만료/성사된 조각은 "이미 종료된 깃발입니다" 에러로 삭제 불가.
--   종료된 조각은 실제 취소가 아니라 "내 목록에서 숨김"만 필요하므로
--   상태를 건드리지 않는 hidden_by_host 플래그를 도입.

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS hidden_by_host BOOLEAN NOT NULL DEFAULT false;

-- 호스트(MD 직통 조각의 방장 본인)만 자신의 조각을 숨길 수 있음.
-- 상태 무관(open 포함 어떤 상태든) 숨김 가능 — 단, open 조각은 프론트에서
-- cancel_puzzle_with_reason()로 정식 취소를 우선 호출하고, 종료 조각에만 이 RPC 사용.
CREATE OR REPLACE FUNCTION md_hide_share(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM puzzles
    WHERE id = p_puzzle_id
      AND leader_id = v_uid
      AND host_is_md = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  UPDATE puzzles
  SET hidden_by_host = true
  WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION md_hide_share(UUID) IS
  'Migration 429: MD 직통 조각 호스트가 종료된 조각을 대시보드 목록에서 숨김(상태 미변경).';
