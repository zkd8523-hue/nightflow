-- ============================================================================
-- Migration 530: 파티에 오퍼가 도착하면 단톡방에 바로 알린다
-- 날짜: 2026-08-07
--
-- 배경
--   유저가 연 파티는 "파트너들이 오퍼를 보낸다 → 파티원끼리 보고 투표한다 →
--   파티장이 고른다"로 흘러가는데, 오퍼가 도착한 사실이 단톡방에 전혀 드러나지
--   않았다. 채팅 상단 "받은 오퍼 N건" 드롭다운은 실시간으로 갱신되지만 접혀 있어,
--   방을 열고 그걸 펼쳐본 사람만 알 수 있었다.
--
-- 변경
--   1) 파티(is_recruiting_party)에 오퍼가 들어오면 단톡방에 시스템 메시지를 남긴다.
--   2) 그 파티의 첫 오퍼일 때만 파티원 전원에게 in-app 알림을 보낸다.
--      시스템 메시지는 안읽음 카운트에서 제외되므로(Migration 360/484의
--      `is_system = false` 조건), 메시지만으로는 도달이 안 된다. 그렇다고 오퍼마다
--      알림을 쏘면 파티원 수 x 오퍼 수만큼 울리므로 첫 건으로 제한한다.
--      (방장에게 첫 오퍼/3건 누적을 1회씩 알리는 notify-puzzle-events와 같은 방침)
--
--   3) 겸사겸사 이 함수가 유저에게 내보내는 문구에서 "조각"·"제안(서)"를 걷어낸다.
--      UI에서는 이미 "파티"·"오퍼"로 통일됐는데 알림·에러 문구만 옛 용어로 남아
--      있었다. 로직은 손대지 않는다.
--
-- 대상 함수: submit_offer — Migration 477의 활성 정의를 그대로 복사하고
--   위 세 가지만 반영. 가격 검증·카운터·한도 로직은 전부 동일하다.
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
  v_min_price INTEGER;
  v_max_price INTEGER;
  v_active_offers INTEGER;
  v_kind TEXT;
  v_is_first_offer BOOLEAN;
  v_offer_id UUID;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상을 찾을 수 없습니다');
  END IF;

  -- 파티/깃발 용어 (null-check 이후 안전)
  v_kind := CASE WHEN v_puzzle.is_recruiting_party THEN '파티' ELSE '깃발' END;

  IF v_md.role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 또는 관리자만 오퍼할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 파트너만 오퍼할 수 있습니다');
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
    -- 파티: 인원·가격 실시간 변동 → 예산과 정확히 일치해야 함 (기존 동일)
    IF p_proposed_price <> v_current_budget THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('오퍼 금액은 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
      );
    END IF;
  ELSE
    -- 깃발: 예산의 80~120% 범위 내에서 자유 조정 허용
    v_min_price := ROUND(v_current_budget * 0.8);
    v_max_price := ROUND(v_current_budget * 1.2);
    IF p_proposed_price < v_min_price OR p_proposed_price > v_max_price THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('오퍼 금액은 예산의 ±20%% 사이여야 합니다 (%s원 ~ %s원)', v_min_price, v_max_price)
      );
    END IF;
  END IF;

  -- 같은 대상 중복 제안 방지(개수 제한 아님 — 유지)
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', format('이미 오퍼한 %s입니다', v_kind));
  END IF;

  -- 이번 오퍼가 이 대상의 첫 오퍼인지 (INSERT 전에 판정)
  v_is_first_offer := NOT EXISTS (
    SELECT 1 FROM puzzle_offers WHERE puzzle_id = p_puzzle_id
  );

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment)
  RETURNING id INTO v_offer_id;

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
    '파트너 오퍼 도착',
    CASE WHEN v_puzzle.is_recruiting_party
      THEN '파트너가 회원님의 파티에 오퍼를 보냈습니다. 확인해보세요!'
      ELSE '파트너가 회원님의 깃발에 오퍼를 보냈습니다. 확인해보세요!'
    END,
    '/flags/' || p_puzzle_id
  );

  -- ── 파티 전용: 단톡방에 도착 사실 + 오퍼 카드를 남긴다 ────────────────────
  -- 문구에 클럽명·금액을 직접 박지 않고 shared_offer_id만 단다. 카드 렌더는
  -- 기존 "이거 어때요?" 공유 카드(Migration 363)를 그대로 재사용하는데, 그쪽이
  -- 이미 파트너에게는 마스킹 처리돼 있어(경쟁 오퍼 비공개) 여기서 새로 막을 게 없다.
  IF v_puzzle.is_recruiting_party THEN
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system, shared_offer_id)
    VALUES (p_puzzle_id, NULL, '🎉 신규 오퍼가 도착했어요!', TRUE, v_offer_id);

    -- 첫 오퍼일 때만 파티원에게 알림 (방장은 위에서 이미 받음)
    IF v_is_first_offer THEN
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      SELECT
        pm.user_id,
        'puzzle_offer_received',
        '파티에 첫 오퍼가 왔어요',
        '채팅방에서 오퍼를 확인하고 투표해보세요!',
        '/party/' || p_puzzle_id
      FROM puzzle_members pm
      WHERE pm.puzzle_id = p_puzzle_id
        AND pm.user_id <> v_puzzle.leader_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
