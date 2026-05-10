-- ============================================================================
-- Migration 151: 깃발 프리미엄 오퍼(+20%) 제거 — 가격을 예산 정가로 고정
-- 날짜: 2026-05-11
-- 설명:
--   - submit_offer() / update_offer() 가격 검증을 정가 일치로 강제
--   - 가격 차별화 → 포함 내역(보틀/서비스) 차별화로 단순화
--   - 기존 pending 오퍼 데이터는 그대로 보존 (수정 시점부터 새 룰 적용)
-- 참조: Migration 127(상한 1.2 도입), 128(current_count 기준 픽스), 138(update_offer)
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_offer(
  p_puzzle_id UUID,
  p_club_id UUID,
  p_table_type TEXT,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_md users%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_current_budget INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 깃발입니다');
  END IF;
  IF v_md.md_active_offers_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', '동시 활성 오퍼는 최대 3건입니다');
  END IF;

  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;
  IF v_md.md_daily_offers_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '일일 제안 횟수(6건)를 초과했습니다');
  END IF;

  v_current_budget := COALESCE(
    FLOOR(v_puzzle.total_budget::NUMERIC / NULLIF(v_puzzle.target_count, 0)) * v_puzzle.current_count,
    v_puzzle.budget_per_person * v_puzzle.current_count
  );

  -- 정가 고정: 예산과 정확히 일치해야만 제안 가능
  IF p_proposed_price <> v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 깃발입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  UPDATE users SET
    md_active_offers_count = md_active_offers_count + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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

  v_current_budget := COALESCE(
    FLOOR(v_puzzle.total_budget::NUMERIC / NULLIF(v_puzzle.target_count, 0)) * v_puzzle.current_count,
    v_puzzle.budget_per_person * v_puzzle.current_count
  );

  IF p_proposed_price <> v_current_budget THEN
    RETURN jsonb_build_object('success', false, 'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget));
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
