-- ============================================================================
-- Migration 133: submit_offer 알림에 action_url 누락 수정
-- 날짜: 2026-05-07
-- 설명:
--   Migration 128의 submit_offer()가 in_app_notifications INSERT 시
--   action_url을 비워둬서, 방장이 'MD 제안 도착' 알림 클릭 시
--   Header.tsx의 fallback("/")으로 홈으로만 이동하던 문제 해결.
--
--   Migration 111이 과거 데이터는 백필했으나 신규 알림 생성 로직은
--   여전히 비어있었음. submit_offer를 CREATE OR REPLACE해서
--   action_url = '/puzzles/' || puzzle_id 추가.
--
--   기존 NULL action_url을 가진 puzzle_offer_received 알림도 백필.
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
  v_max_price INTEGER;
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
  v_max_price := CEIL(v_current_budget * 1.2);

  IF p_proposed_price < v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산 이하로는 제안할 수 없습니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산의 120%%를 초과할 수 없습니다 (최대 %s원)', v_max_price)
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

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!',
    '/puzzles/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 NULL action_url 가진 puzzle_offer_received 알림 백필
-- (방장 = leader_id 매칭, 동시간대 가장 가까운 puzzle 선택)
UPDATE in_app_notifications n
SET action_url = '/puzzles/' || p.id
FROM puzzles p
WHERE n.type = 'puzzle_offer_received'
  AND n.action_url IS NULL
  AND p.leader_id = n.user_id
  AND p.id = (
    SELECT p2.id FROM puzzles p2
    WHERE p2.leader_id = n.user_id
      AND p2.created_at <= n.created_at
    ORDER BY p2.created_at DESC
    LIMIT 1
  );
