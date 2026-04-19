-- Migration 122: md_active_offers_count 카운터 동기화 + submit_offer 실제 쿼리 기반 체크
-- 카운터 어긋남 문제: 실제 pending 오퍼 수를 직접 COUNT해서 체크

-- 1. 현재 어긋난 카운터 일괄 동기화
UPDATE users u
SET md_active_offers_count = (
  SELECT COUNT(*) FROM puzzle_offers po
  WHERE po.md_id = u.id AND po.status = 'pending'
)
WHERE u.role = 'md';

-- 2. submit_offer: md_active_offers_count 대신 실제 COUNT로 체크
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
  v_max_price INTEGER;
  v_base_budget INTEGER;
  v_actual_active INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 퍼즐입니다');
  END IF;

  -- 실제 pending 오퍼 수로 체크 (카운터 어긋남 방지)
  SELECT COUNT(*) INTO v_actual_active
  FROM puzzle_offers WHERE md_id = auth.uid() AND status = 'pending';

  IF v_actual_active >= 3 THEN
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

  v_base_budget := COALESCE(v_puzzle.total_budget, v_puzzle.budget_per_person * v_puzzle.target_count);
  v_max_price := CEIL(v_base_budget * 1.3);
  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object('success', false, 'error', format('예산의 130%%를 초과할 수 없습니다 (최대 %s원)', v_max_price));
  END IF;

  IF EXISTS (SELECT 1 FROM puzzle_offers WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 퍼즐입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- 카운터도 실제 값으로 동기화
  UPDATE users SET
    md_active_offers_count = v_actual_active + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 퍼즐에 제안서를 보냈습니다. 확인해보세요!',
    '/puzzles/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
