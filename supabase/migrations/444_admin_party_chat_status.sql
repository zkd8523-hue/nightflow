-- ============================================================================
-- Migration 444: admin이 조각의 상담(파티챗) 상태를 상세히 확인하는 RPC
-- 날짜: 2026-07-11
-- 설명:
--   조각 상세에서 admin이 두 가지를 봄:
--     1) 파티 채팅 활성도 — 파티원끼리 실제로 대화하는지 (MD 초대와 무관하게 항상)
--        총 메시지 수, 마지막 발화자(이름), 마지막 시각
--     2) MD 상담 — 오퍼 선택 → invite_md_to_party로 초대된 MD가 있으면:
--        선택 오퍼(클럽·가격·과금), consented_at, MD 발화 수
--
--   puzzle_party_messages RLS는 참여자 전용 → SECURITY DEFINER로 우회(카운트·시각·발신자명만, 내용 X).
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_party_md_status(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin      BOOLEAN;
  v_total         INTEGER;
  v_last_at       TIMESTAMPTZ;
  v_last_sender   UUID;
  v_last_name     TEXT := NULL;
  v_pm            RECORD;
  v_md            RECORD;
  v_md_cnt        INTEGER := 0;
  v_offer_price   INTEGER := NULL;
  v_offer_charged BOOLEAN := NULL;
  v_club_name     TEXT := NULL;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 조회할 수 있어요');
  END IF;

  -- 1) 파티 채팅 통계 (비시스템·미삭제, MD 초대와 무관하게 항상)
  SELECT count(*) INTO v_total
  FROM puzzle_party_messages
  WHERE puzzle_id = p_puzzle_id AND is_system = false AND is_deleted = false;

  SELECT created_at, sender_id INTO v_last_at, v_last_sender
  FROM puzzle_party_messages
  WHERE puzzle_id = p_puzzle_id AND is_system = false AND is_deleted = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_sender IS NOT NULL THEN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '알수없음')
      INTO v_last_name FROM users WHERE id = v_last_sender;
  END IF;

  -- 2) 초대 MD (있으면)
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;

  IF v_pm.puzzle_id IS NOT NULL THEN
    SELECT display_name, name, instagram INTO v_md FROM users WHERE id = v_pm.md_id;

    SELECT count(*) INTO v_md_cnt
    FROM puzzle_party_messages
    WHERE puzzle_id = p_puzzle_id AND is_system = false AND is_deleted = false
      AND sender_id = v_pm.md_id;

    IF v_pm.offer_id IS NOT NULL THEN
      SELECT o.proposed_price, (o.charged_at IS NOT NULL), c.name
        INTO v_offer_price, v_offer_charged, v_club_name
        FROM puzzle_offers o
        LEFT JOIN clubs c ON c.id = o.club_id
        WHERE o.id = v_pm.offer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    -- 파티 채팅 (항상)
    'chat_total', COALESCE(v_total, 0),
    'chat_last_at', v_last_at,
    'chat_last_name', v_last_name,
    'chat_last_is_md', (v_pm.puzzle_id IS NOT NULL AND v_last_sender = v_pm.md_id),
    'chat_md', v_md_cnt,
    -- 초대 MD (없으면 invited=false)
    'invited', (v_pm.puzzle_id IS NOT NULL),
    'md_name', CASE WHEN v_pm.puzzle_id IS NOT NULL THEN COALESCE(NULLIF(v_md.display_name, ''), NULLIF(v_md.name, ''), 'MD') END,
    'md_instagram', CASE WHEN v_pm.puzzle_id IS NOT NULL THEN v_md.instagram END,
    'invited_at', v_pm.invited_at,
    'consented_at', v_pm.consented_at,
    'offer_id', v_pm.offer_id,
    'offer_price', v_offer_price,
    'offer_club_name', v_club_name,
    'offer_charged', v_offer_charged
  );
END;
$$;
GRANT EXECUTE ON FUNCTION admin_get_party_md_status(UUID) TO authenticated;
