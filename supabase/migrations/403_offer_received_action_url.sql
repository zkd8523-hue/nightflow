-- ============================================================================
-- Migration 403: submit_offer() 알림에 action_url 추가 (상세로 딥링크)
-- 날짜: 2026-07-02
-- 설명:
--   "MD 제안 도착"(puzzle_offer_received) 알림이 action_url 없이 생성돼
--   클릭 시 상세로 못 가고 홈으로 튀었음. '/flags/{puzzle_id}' 추가.
--   (Migration 359 submit_offer 본문 그대로 복제 + 알림 INSERT에 action_url만 추가)
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
  v_kind TEXT;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상을 찾을 수 없습니다');
  END IF;

  -- 조각/깃발 용어 (null-check 이후 안전)
  v_kind := CASE WHEN v_puzzle.is_recruiting_party THEN '조각' ELSE '깃발' END;

  IF v_md.role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 또는 관리자만 제안할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', format('모집이 종료된 %s입니다', v_kind));
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', format('마감된 %s입니다', v_kind));
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

  -- 같은 대상 중복 제안 방지(개수 제한 아님 — 유지)
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', format('이미 제안한 %s입니다', v_kind));
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- 카운터 유지(드리프트 방지) — 차단엔 사용 안 함
  UPDATE users SET
    md_active_offers_count = v_active_offers + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    CASE WHEN v_puzzle.is_recruiting_party
      THEN 'MD가 회원님의 조각에 제안서를 보냈습니다. 확인해보세요!'
      ELSE 'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
    END,
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
