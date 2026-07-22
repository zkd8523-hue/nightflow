-- ============================================================================
-- Migration 478: admin_get_party_md_status() "record v_md is not assigned yet" 수정
-- 날짜: 2026-07-21
--
-- 문제: Migration 444에서 v_md를 RECORD로 선언하고, SELECT INTO를
--       `IF v_pm.puzzle_id IS NOT NULL` 블록 안에서만 실행했다.
--       초대된 MD가 없는 조각(= 대부분)에서는 v_md가 미할당 상태로 남는데,
--       마지막 RETURN의 `CASE WHEN ... THEN v_md.display_name END`이
--       분기를 타지 않아도 필드를 참조하면서 런타임 에러가 발생했다.
--       → admin 조각 상세의 "조각 상담 상태"가 영원히 로딩 상태로 멈춤.
--
-- 해결: v_md RECORD를 NULL로 초기화된 스칼라 변수 3개로 교체.
--       미할당 상태 자체가 생기지 않으므로 CASE 분기와 무관하게 안전하다.
--       나머지 로직·반환 형태는 444와 동일 (클라이언트 수정 불필요).
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
  -- 444에서 RECORD였던 부분 → 미할당 참조를 원천 차단하기 위해 스칼라로 분리
  v_md_display    TEXT := NULL;
  v_md_name       TEXT := NULL;
  v_md_instagram  TEXT := NULL;
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
    SELECT display_name, name, instagram
      INTO v_md_display, v_md_name, v_md_instagram
      FROM users WHERE id = v_pm.md_id;

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
    -- 초대 MD (없으면 invited=false, 나머지는 NULL)
    'invited', (v_pm.puzzle_id IS NOT NULL),
    'md_name', CASE WHEN v_pm.puzzle_id IS NOT NULL
                    THEN COALESCE(NULLIF(v_md_display, ''), NULLIF(v_md_name, ''), 'MD') END,
    'md_instagram', CASE WHEN v_pm.puzzle_id IS NOT NULL THEN v_md_instagram END,
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
