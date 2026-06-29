-- ============================================================================
-- Migration 339: MD 오퍼 개수 제한 제거
-- 날짜: 2026-06-29
-- 설명:
--   - 동시 활성 오퍼 5건 제한 제거
--   - 일일 제안 6건 제한 제거
--   - 나머지 검증(권한/상태/마감/예산 일치/중복 제안 방지)·카운터·알림은 유지
--   - 기준: Migration 329 submit_offer 에서 두 한도 IF 블록만 삭제
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
  v_active_offers INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_md.role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 또는 관리자만 제안할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 깃발입니다');
  END IF;

  -- 카운터 동기화용으로만 현재 활성 오퍼 수 집계 (한도 차단은 제거됨)
  SELECT COUNT(*) INTO v_active_offers
  FROM puzzle_offers po
  JOIN puzzles pz ON pz.id = po.puzzle_id
  WHERE po.md_id = auth.uid()
    AND po.status = 'pending'
    AND pz.status IN ('open', 'selecting');

  -- 일일 카운터 리셋(통계용) — 한도 차단은 제거됨
  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;

  -- 예산 계산: 프론트엔드(OfferSheet.tsx)와 동일한 로직
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

  -- 같은 깃발 중복 제안 방지(개수 제한 아님 — 유지)
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 깃발입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- 카운터 유지(드리프트 방지) — 차단엔 사용 안 함
  UPDATE users SET
    md_active_offers_count = v_active_offers + 1,
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
