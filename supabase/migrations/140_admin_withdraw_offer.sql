-- ============================================================================
-- Migration 140: admin_withdraw_offer() — 어드민 제안 강제 철회
-- 날짜: 2026-05-08
-- 설명: withdraw_offer()는 본인(MD)만 호출 가능. 어드민이 직접 제안을 철회할
--       수 있도록 별도 admin 전용 함수 추가.
--       - 상태 → 'withdrawn'
--       - MD 슬롯 회복 (md_active_offers_count 감소)
--       - MD에게 인앱 알림 발송
--       - 어드민 권한 검증
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_withdraw_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
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

  -- MD 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'offer_withdrawn_by_admin',
    '제안 철회',
    '관리자에 의해 제안이 철회되었습니다.',
    '/flags/' || v_offer.puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
