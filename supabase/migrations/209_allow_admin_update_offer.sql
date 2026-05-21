-- ============================================================================
-- Migration 209: update_offer 어드민 우회 허용
-- 날짜: 2026-05-21
-- 설명:
--   - 169 update_offer는 본인(md_id = auth.uid()) 오퍼만 수정 허용
--   - 어드민은 시크릿 오퍼 모니터링/정정 권한이 필요 (운영 케이스: MD 부재중 가격/주류 정정 요청)
--   - users.role = 'admin' 이면 본인 체크 우회
--   - 그 외 로직(169 예산 검증, 풀 모집 처리 등) 전부 유지
-- 참조: Migration 152(admin submit_offer 허용), 169(예산 반올림 수정)
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
  v_is_admin BOOLEAN;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT role = 'admin' INTO v_is_admin FROM users WHERE id = auth.uid();

  IF NOT v_is_admin AND v_offer.md_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 오퍼만 수정할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '대기 중인 오퍼만 수정할 수 있습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;

  IF v_puzzle.current_count = v_puzzle.target_count THEN
    v_current_budget := COALESCE(
      v_puzzle.total_budget,
      v_puzzle.budget_per_person * v_puzzle.target_count
    );
  ELSE
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
