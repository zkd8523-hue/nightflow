-- ============================================================================
-- Migration 138: update_offer() — MD 본인의 pending 오퍼 수정
-- 날짜: 2026-05-08
-- 설명: MD가 제안 후에도 가격/포함내역/코멘트/클럽을 수정할 수 있도록 추가.
--       철회 후 재제출 대신 같은 오퍼 ID 보존 (히스토리 일관성).
--       검증은 submit_offer와 동일.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_offer(
  p_offer_id UUID,
  p_club_id UUID,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_current_budget INTEGER;
  v_max_price INTEGER;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  IF v_offer.md_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 오퍼만 수정할 수 있습니다');
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '대기 중인 오퍼만 수정할 수 있습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;

  -- 가격 검증 (submit_offer Migration 128과 동일)
  v_current_budget := COALESCE(
    FLOOR(v_puzzle.total_budget::NUMERIC / NULLIF(v_puzzle.target_count, 0)) * v_puzzle.current_count,
    v_puzzle.budget_per_person * v_puzzle.current_count
  );
  v_max_price := CEIL(v_current_budget * 1.2);

  IF p_proposed_price < v_current_budget THEN
    RETURN jsonb_build_object('success', false, 'error', format('예산 이하로는 제안할 수 없습니다 (예산: %s원)', v_current_budget));
  END IF;
  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object('success', false, 'error', format('예산의 120%%를 초과할 수 없습니다 (최대 %s원)', v_max_price));
  END IF;

  UPDATE puzzle_offers SET
    club_id = p_club_id,
    proposed_price = p_proposed_price,
    includes = COALESCE(p_includes, '{}'),
    comment = p_comment,
    updated_at = now()
  WHERE id = p_offer_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
