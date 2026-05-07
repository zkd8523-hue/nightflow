-- ============================================================================
-- Migration 139: accept_offer() — kakao_open_chat_url을 선택 입력으로 전환
-- 날짜: 2026-05-08
-- 설명:
--   기존 134에서 방장이 수락 시점에 본인 오픈채팅 URL을 강제 입력해야 했던
--   마찰을 제거. MD가 신청 시 등록한 연락 수단(instagram/phone/kakao)을
--   클라이언트가 직접 노출하므로 URL은 더 이상 필수가 아님.
--
--   유저가 본인 연락처 노출을 피하고 싶을 때만 오픈채팅 URL을 fallback으로
--   넘김. URL이 들어오면 형식 검증, 없으면 NULL 저장.
--
--   영향:
--   - p_kakao_open_chat_url: TEXT NOT NULL → TEXT DEFAULT NULL
--   - puzzles.kakao_open_chat_url: NULL 저장 가능 (Migration 128에서 이미 nullable)
--   - MD 알림 메시지: URL 유무에 따라 분기
--   - 기존 134의 다른 비즈니스 로직(타 오퍼 expire, MD active count 차감,
--     거절 알림 발송)은 모두 보존
-- ============================================================================

DROP FUNCTION IF EXISTS accept_offer(UUID, TEXT);

CREATE OR REPLACE FUNCTION accept_offer(
  p_offer_id UUID,
  p_kakao_open_chat_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md users%ROWTYPE;
BEGIN
  -- URL이 제공된 경우에만 형식 검증
  IF p_kakao_open_chat_url IS NOT NULL
     AND p_kakao_open_chat_url !~ '^https://open\.kakao\.com/o/' THEN
    RETURN jsonb_build_object('success', false, 'error', '올바른 카카오 오픈채팅 링크 형식이 아닙니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  IF v_md.md_credits < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  -- 선택된 오퍼 → accepted
  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 같은 퍼즐의 나머지 pending 오퍼 → expired
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  -- 거절된 MD들의 active count 감소
  UPDATE users
  SET md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  -- 거절된 MD들에게 미선택 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택',
         '방장이 다른 제안을 선택했습니다.',
         '/flags/' || v_offer.puzzle_id
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  -- 퍼즐 본체 상태 갱신 (kakao_open_chat_url은 NULL일 수 있음)
  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id,
    kakao_open_chat_url = p_kakao_open_chat_url
  WHERE id = v_offer.puzzle_id;

  -- 선택된 MD 크레딧 차감 + active count 감소
  UPDATE users SET
    md_credits = md_credits - 30,
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  -- 선택된 MD에게 수락 알림 (URL 제공 여부에 따라 메시지 분기)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    CASE
      WHEN p_kakao_open_chat_url IS NOT NULL THEN
        '방장이 회원님의 제안을 선택했습니다. 오픈채팅으로 입장해 예약을 확정하세요.'
      ELSE
        '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
    END,
    '/flags/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', p_kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
