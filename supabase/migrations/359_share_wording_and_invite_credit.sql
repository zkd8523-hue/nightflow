-- ============================================================================
-- Migration 359: 조각 오퍼 에러 문구 분기 + 상담 초대 시 크레딧 사용 고지
-- 날짜: 2026-07-02
-- 설명:
--   (1) submit_offer()는 깃발·조각 공용인데 에러 문구가 "깃발"로 하드코딩돼
--       조각에 오퍼하는 MD가 "이미 제안한 깃발입니다" 등을 봄. is_recruiting_party로 분기.
--       (Migration 348 본문 그대로 복제 + 에러 message만 CASE 분기)
--   (2) invite_md_to_party()가 실제 크레딧 차감 순간인데 알림에 크레딧 언급이 없어
--       MD가 언제 차감됐는지 모름. 초대 알림에 "매치 크레딧 N개 사용" 고지 추가.
--       (Migration 357 본문 그대로 복제 + 알림 문구만 변경)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) submit_offer(): 에러 문구 조각/깃발 분기 (348 본문 복제)
-- ----------------------------------------------------------------------------
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

  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    CASE WHEN v_puzzle.is_recruiting_party
      THEN 'MD가 회원님의 조각에 제안서를 보냈습니다. 확인해보세요!'
      ELSE 'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
    END
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- (2) invite_md_to_party(): 초대(=과금) 알림에 크레딧 사용 고지 (357 본문 복제)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_offer       puzzle_offers%ROWTYPE;
  v_md_name     TEXT;
  v_club_name   TEXT;
  v_cost        INTEGER;
  v_charged_now BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 초대할 수 있어요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL OR v_offer.puzzle_id <> p_puzzle_id THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 이미 같은 MD면 그대로 성공(멱등)
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = v_offer.md_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  -- 다른 MD가 이미 초대돼 있으면 거부 (조각당 MD 1명). 바꾸려면 먼저 내보내야 함.
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      '이미 상담 중인 MD가 있어요. 먼저 내보낸 뒤 초대해주세요');
  END IF;

  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  -- 상담 시작(초대) = 유료 지점. 매치 크레딧 1회 과금 ("초대 or 즉시수락" 중 먼저; charged_at dedup)
  -- (잔액<0 허용 = 외상 1매치분, 차단은 submit_offer 단계)
  v_cost := puzzle_match_credit_cost(p_puzzle_id);
  IF v_offer.charged_at IS NULL THEN
    UPDATE users SET md_credits = md_credits - v_cost
    WHERE id = v_offer.md_id;
    UPDATE puzzle_offers SET charged_at = now() WHERE id = p_offer_id;
    v_charged_now := TRUE;
  END IF;

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_offer.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  -- 단체방 시스템 메시지: "{클럽명} {MD닉네임} 파트너가 상담을 위해 초대되었어요"
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담을 위해 초대되었어요',
    TRUE
  );
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  -- MD 알림: 실제 과금 순간이므로 크레딧 사용을 명시 (이번 호출에서 차감된 경우만)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '단체채팅에 초대됐어요!',
    CASE WHEN v_charged_now
      THEN format('방장이 상담을 위해 초대했어요. 매치 크레딧 %s개가 사용됐어요. 지금 대화를 시작해보세요!', v_cost)
      ELSE '방장이 상담을 위해 단체채팅에 초대했어요. 지금 대화를 시작해보세요!'
    END,
    '/party/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
