-- ============================================================================
-- Migration 128: submit_offer 하한/상한 기준을 current_count 기반으로 수정
-- 날짜: 2026-05-05
-- 설명:
--   Migration 127의 버그 픽스. 하한 검증이 total_budget(목표 인원 기준)을
--   사용해서 파티원 모집 깃발(current_count < target_count)에서 MD 오퍼가
--   100% 차단되는 문제 해결.
--
--   클라이언트(OfferSheet.tsx)는 perPersonBudget × current_count로 계산하는데,
--   Migration 127 서버는 total_budget으로 검증해서 둘이 어긋났음.
--   서버를 클라이언트와 동일한 current_count 기준으로 통일.
--
-- 영향 범위:
--   - 인원 확정 깃발(current_count == target_count): 동작 동일 (값 같음)
--   - 파티원 모집 깃발(current_count < target_count): MD 오퍼 정상화
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

  -- 클라이언트(OfferSheet.tsx)와 동일한 current_count 기반 예산 계산
  -- total_budget이 있으면 인당 환산 후 current_count 곱셈, 없으면 budget_per_person × current_count
  v_current_budget := COALESCE(
    FLOOR(v_puzzle.total_budget::NUMERIC / NULLIF(v_puzzle.target_count, 0)) * v_puzzle.current_count,
    v_puzzle.budget_per_person * v_puzzle.current_count
  );
  v_max_price := CEIL(v_current_budget * 1.2);

  -- 하한 검증: 현재 인원 기준 예산 이상으로만 제안 가능
  IF p_proposed_price < v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산 이하로는 제안할 수 없습니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  -- 상한 검증: 예산의 120% (업셀 한도)
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
