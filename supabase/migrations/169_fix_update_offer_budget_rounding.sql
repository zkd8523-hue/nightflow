-- ============================================================================
-- Migration 169: update_offer 예산 계산 반올림 오차 수정
-- 날짜: 2026-05-15
-- 설명:
--   - 168에서 submit_offer를 수정했으나 update_offer(152)도 동일한 버그 존재
--   - 기존: FLOOR(total_budget / target_count) * current_count
--     → total_budget이 target_count로 나누어떨어지지 않을 때 1원 손실
--   - 변경: 프론트엔드(OfferSheet.tsx) 로직과 일치하도록 조정
--       · current_count = target_count → total_budget 그대로
--       · 아니면 ROUND(total_budget * current_count / target_count)
--   - 152의 다른 로직(정가 고정, 권한 체크) 모두 유지
-- 참조: Migration 152(admin 허용 update_offer 최신본), 168(submit_offer 동일 수정)
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

  -- 예산 계산: 프론트엔드(OfferSheet.tsx) / submit_offer(168)와 동일한 로직
  IF v_puzzle.current_count = v_puzzle.target_count THEN
    -- 풀 모집: total_budget 그대로 (반올림 손실 방지)
    v_current_budget := COALESCE(
      v_puzzle.total_budget,
      v_puzzle.budget_per_person * v_puzzle.target_count
    );
  ELSE
    -- 진행 중: 비례 계산 후 반올림 (JavaScript Math.round와 일치)
    v_current_budget := COALESCE(
      ROUND(v_puzzle.total_budget::NUMERIC * v_puzzle.current_count
            / NULLIF(v_puzzle.target_count, 0))::INTEGER,
      v_puzzle.budget_per_person * v_puzzle.current_count
    );
  END IF;

  IF p_proposed_price <> v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
    );
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
