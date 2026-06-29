-- ============================================================================
-- Migration 335: 방장이 "내 깃발" 목록에서 완료/만료 깃발 숨기기
-- 날짜: 2026-06-29
-- 설명:
--   사용자 관점에선 "삭제(복구불가)"지만, 매치/거래 기록 보존을 위해 소프트 숨김.
--   leader_hidden_at 설정 → 방장 본인 목록에서만 제외. MD/거래 데이터엔 영향 없음.
--   진행 중(open/selecting) 깃발은 숨길 수 없음.
-- ============================================================================

ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS leader_hidden_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION hide_my_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 깃발만 삭제할 수 있습니다');
  END IF;
  IF v_puzzle.status IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '진행 중인 깃발은 삭제할 수 없습니다');
  END IF;
  UPDATE puzzles SET leader_hidden_at = now() WHERE id = p_puzzle_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION hide_my_puzzle(UUID) TO authenticated;
