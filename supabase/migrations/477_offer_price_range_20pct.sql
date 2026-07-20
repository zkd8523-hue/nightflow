-- Migration 477: 깃발 오퍼 제안가 범위 허용 (예산의 80~120%)
-- 배경: 지금까지 오퍼 제안가는 깃발 예산과 정확히 일치해야만 했음(가격 고정).
--       MD가 보틀·서비스로 차별화해도 가격으로는 경쟁/조정할 수 없었음.
-- 변경: 깃발(is_recruiting_party=false)만 예산의 80~120% 범위 내에서 제안가 자유 조정 허용.
--       조각(is_recruiting_party=true)은 인원·가격이 실시간 변동되므로 기존과 동일하게
--       예산과 정확히 일치해야 함 (프론트 UI에도 가격 입력 필드가 없음).
-- 대상 함수: submit_offer(신규 제안), update_offer(제안 수정). 각 함수의 "현재 활성 정의"를
--   그대로 복사하고 가격 검증 블록만 교체 (나머지 로직 변경 없음).

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
  v_min_price INTEGER;
  v_max_price INTEGER;
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
    RETURN jsonb_build_object('success', false, 'error', '파트너 또는 관리자만 제안할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 파트너만 제안할 수 있습니다');
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

  IF v_puzzle.is_recruiting_party THEN
    -- 조각: 인원·가격 실시간 변동 → 예산과 정확히 일치해야 함 (기존 동일)
    IF p_proposed_price <> v_current_budget THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
      );
    END IF;
  ELSE
    -- 깃발: 예산의 80~120% 범위 내에서 자유 조정 허용
    v_min_price := ROUND(v_current_budget * 0.8);
    v_max_price := ROUND(v_current_budget * 1.2);
    IF p_proposed_price < v_min_price OR p_proposed_price > v_max_price THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('제안가는 예산의 ±20%% 사이여야 합니다 (%s원 ~ %s원)', v_min_price, v_max_price)
      );
    END IF;
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
    '파트너 제안 도착',
    CASE WHEN v_puzzle.is_recruiting_party
      THEN '파트너가 회원님의 조각에 제안서를 보냈습니다. 확인해보세요!'
      ELSE '파트너가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
    END,
    '/flags/' || p_puzzle_id
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
  v_min_price INTEGER;
  v_max_price INTEGER;
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

  IF v_puzzle.is_recruiting_party THEN
    IF p_proposed_price <> v_current_budget THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
      );
    END IF;
  ELSE
    v_min_price := ROUND(v_current_budget * 0.8);
    v_max_price := ROUND(v_current_budget * 1.2);
    IF p_proposed_price < v_min_price OR p_proposed_price > v_max_price THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('제안가는 예산의 ±20%% 사이여야 합니다 (%s원 ~ %s원)', v_min_price, v_max_price)
      );
    END IF;
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
