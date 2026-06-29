-- ============================================================================
-- Migration 333: accept_offer() 매치당 15크레딧 1회 (플래그 분기)
-- 날짜: 2026-06-28 (수정: 채팅 없는 수락도 과금하도록 보강)
-- 설명:
--   오퍼 채팅 모델: 매치 1건당 MD에게 15크레딧 1회만 과금.
--   "MD 첫 답장 OR 방장 수락" 중 먼저 오는 쪽에서 차감 (이중과금 없음):
--     - 채팅 첫 답장 시 → send_offer_message 에서 15 차감 → 수락은 무료
--     - 채팅 없이 바로 수락 시 → accept_offer 에서 15 차감 (공짜 매치 방지)
--   Kill Switch 연동:
--     - is_offer_chat_enabled() = TRUE  → 위 신규 모델
--     - is_offer_chat_enabled() = FALSE → 기존 모델 (수락 시 30크레딧)
--   플래그를 끄면 이 함수가 자동으로 Migration 170 동작으로 원복된다.
--
--   Migration 170 본문과 동일하되, "6) MD 크레딧 차감" 블록만 플래그 분기로 교체.
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer  puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md     users%ROWTYPE;
  v_chat_on BOOLEAN;
BEGIN
  v_chat_on := is_offer_chat_enabled();

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

  -- 검증
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status NOT IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  -- 기존 모델(플래그 OFF)일 때만 수락 시 크레딧 검증
  IF NOT v_chat_on AND COALESCE(v_md.md_credits, 0) < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  -- 오퍼 수락
  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 나머지 pending 오퍼 expired 처리
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  -- 탈락 MD들 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  -- 탈락 MD들에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  -- 퍼즐 상태 변경
  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 — 플래그 분기
  IF v_chat_on THEN
    -- 신규 모델: 매치당 15크레딧 1회. "첫 답장 또는 수락" 중 먼저 오는 쪽에서 과금.
    IF EXISTS (
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id
    ) THEN
      -- 이미 채팅 첫 답장에서 15 차감됨 → 이중과금 방지, 슬롯만 감소
      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    ELSE
      -- 채팅 없이 바로 수락 → 매치당 과금 보장 위해 여기서 15 차감
      -- (잔액<0 허용 = 외상 1매치분, 차단은 submit_offer 단계에서)
      UPDATE users SET
        md_credits = md_credits - 15,
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    END IF;
  ELSE
    -- 기존 모델: 수락 시 30크레딧 + 슬롯 감소 (Migration 170 동작)
    UPDATE users SET
      md_credits = md_credits - 30,
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_offer.md_id;
  END IF;

  -- 수락된 MD에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
