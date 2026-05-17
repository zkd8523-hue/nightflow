-- ============================================================================
-- Migration 193: admin_withdraw_offer() — 철회 사유(메시지) 파라미터 추가
-- 날짜: 2026-05-17
-- 설명: 어드민이 오퍼를 강제 철회할 때 MD에게 전달할 사유를 함께 입력할 수
--       있도록 p_reason 파라미터 추가. 알림 message 본문에 사유를 합쳐 발송.
--       기존 시그니처(파라미터 1개) 호출 호환을 위해 default NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_withdraw_offer(
  p_offer_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_offer       puzzle_offers%ROWTYPE;
  v_reason      TEXT;
  v_message     TEXT;
BEGIN
  IF (SELECT role FROM users WHERE id = auth.uid()) != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 사용할 수 있습니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;

  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다 (' || v_offer.status || ')');
  END IF;

  UPDATE puzzle_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE id = p_offer_id;

  -- MD 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  -- 사유 정제(빈 문자열은 NULL 처리, 최대 300자)
  v_reason := NULLIF(BTRIM(p_reason), '');
  IF v_reason IS NOT NULL AND length(v_reason) > 300 THEN
    v_reason := left(v_reason, 300);
  END IF;

  IF v_reason IS NULL THEN
    v_message := '관리자에 의해 제안이 철회되었습니다.';
  ELSE
    v_message := '관리자에 의해 제안이 철회되었습니다.' || E'\n사유: ' || v_reason;
  END IF;

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'offer_withdrawn_by_admin',
    '제안 철회',
    v_message,
    '/flags/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
