-- ============================================================================
-- Migration 405: 조각 상담 크레딧 = MD의 "입장 동의" 시점 차감으로 이동
-- 날짜: 2026-07-02
-- 설명:
--   기존: 방장이 MD를 초대하는 순간 MD 크레딧이 자동 차감(MD 동의 시점 없음).
--   변경: 초대는 무료 등록만. MD가 파티챗 첫 입장 시 "매치 크레딧 N개를 사용해
--         상담을 시작할까요?"에 동의해야 차감. 거절하면 차감 없이 오퍼 철회 +
--         파티 MD 해제(방장은 다른 MD 재초대 가능).
--   과금 지점: MD 동의(start_party_consultation) 또는 방장 즉시수락(accept_offer)
--             중 먼저 오는 쪽 1회 (charged_at dedup 유지).
-- ============================================================================

-- 0) 동의 마커
ALTER TABLE puzzle_party_md ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 1) invite_md_to_party(): 과금 제거, 등록 + 초대 알림만 (359 본문 - 과금)
--    공개 시스템 메시지는 MD가 "동의"할 때 붙이도록 이동(거절 시 오해 방지).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
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

  -- 등록만(무료). 크레딧은 MD 동의 시점(start_party_consultation)에 차감.
  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  -- MD가 방을 볼 수 있도록 read 마커만 초기화
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  -- MD 알림: 초대됨(아직 미과금) → 입장 시 동의하면 시작
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '상담 요청이 왔어요!',
    '방장이 단체채팅 상담에 초대했어요. 입장해서 상담을 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2) start_party_consultation(): MD가 입장 동의 → 매치 크레딧 1회 차감
--    (초대 or 즉시수락 중 먼저 온 쪽에서만; charged_at dedup)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm        puzzle_party_md%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_cost      INTEGER;
  v_md_name   TEXT;
  v_club_name TEXT;
  v_charged   BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;
  IF v_pm.md_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '초대된 MD만 상담을 시작할 수 있어요');
  END IF;

  -- 이미 동의했으면 멱등 성공
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = v_pm.offer_id;
  v_cost := puzzle_match_credit_cost(p_puzzle_id);

  -- 과금 (초대/즉시수락 중 먼저 온 쪽 1회만; 잔액<0 허용 = 외상 1매치분)
  IF v_offer.id IS NOT NULL AND v_offer.charged_at IS NULL THEN
    UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_pm.md_id;
    UPDATE puzzle_offers SET charged_at = now() WHERE id = v_offer.id;
    v_charged := TRUE;
  END IF;

  UPDATE puzzle_party_md SET consented_at = now() WHERE puzzle_id = p_puzzle_id;

  -- 공개 시스템 메시지: 상담 시작(동의 시점에 붙임)
  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_pm.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담을 시작했어요',
    TRUE
  );

  RETURN jsonb_build_object('success', true, 'charged', v_charged, 'cost', v_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3) decline_party_consultation(): MD가 거절 → 차감 없음 + 오퍼 철회 + 등록 해제
--    (이미 동의(과금)한 경우는 거절 불가 — 나가기(leave_party)로 처리)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm      puzzle_party_md%ROWTYPE;
  v_leader  UUID;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;
  IF v_pm.md_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '초대된 MD만 거절할 수 있어요');
  END IF;
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 상담을 시작해 거절할 수 없어요');
  END IF;

  SELECT leader_id INTO v_leader FROM puzzles WHERE id = p_puzzle_id;

  -- 오퍼 철회 (재초대 불가 — MD가 다시 오퍼해야 함)
  IF v_pm.offer_id IS NOT NULL THEN
    UPDATE puzzle_offers
    SET status = 'withdrawn', updated_at = now()
    WHERE id = v_pm.offer_id AND status = 'pending';
    UPDATE users SET
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_pm.md_id;
  END IF;

  -- 파티 MD 해제 (슬롯 재개방) + MD의 read 마커 제거
  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  DELETE FROM puzzle_party_reads WHERE puzzle_id = p_puzzle_id AND user_id = v_pm.md_id;

  -- 방장 알림
  IF v_leader IS NOT NULL THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_leader,
      'party_md_released',
      '초대한 MD가 상담을 시작하지 않았어요',
      '초대한 MD가 상담을 시작하지 않았어요. 다른 파트너를 초대해보세요.',
      '/party/' || p_puzzle_id
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION start_party_consultation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_party_consultation(UUID) TO authenticated;
