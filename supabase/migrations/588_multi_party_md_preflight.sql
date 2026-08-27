-- ============================================================================
-- Migration 588: 다중 파트너(MD) 파티 채팅 — Phase 0 사전 정리
-- 날짜: 2026-08-27
-- 배경:
--   파티당 파트너를 여러 명 초대할 수 있게 바꾸려 한다(칩 탭 UI).
--   그런데 아래 두 함수는 puzzle_party_md에 행이 2개가 되는 순간
--   "query returned more than one row" 런타임 에러를 낸다.
--   특히 get_party_invited_offer_id는 anon에게도 GRANT된 함수라
--   비로그인 유저의 파티 상세 페이지까지 같이 죽는다.
--
--   그래서 PK를 바꾸기 "전에" 먼저 다중 행을 견디도록 고쳐둔다.
--   이 마이그레이션만 적용한 상태에서는 행이 여전히 1개이므로 동작 변화가 없다.
--   (배열은 원소 0~1개, 상태 JSON은 기존 키를 그대로 유지)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) get_party_invited_offer_id: UUID → UUID[] (475 대체)
--    "상담중" 배지 판정용. 비방장/비로그인도 호출하므로 md_id 등 PII는 여전히 미노출.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_party_invited_offer_id(UUID);

CREATE OR REPLACE FUNCTION get_party_invited_offer_ids(p_puzzle_id UUID)
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(offer_id) FILTER (WHERE offer_id IS NOT NULL), '{}')
  FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
$$;

GRANT EXECUTE ON FUNCTION get_party_invited_offer_ids(UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) admin_get_party_md_status: 초대 MD를 배열로 (478 대체)
--    기존 스칼라 키(md_name/invited_at/...)는 첫 MD 기준으로 유지해 하위호환.
--    새로 'mds' 배열을 추가하고, 프론트는 이걸 우선 사용한다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_party_md_status(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin    BOOLEAN;
  v_total       INTEGER;
  v_last_at     TIMESTAMPTZ;
  v_last_sender UUID;
  v_last_name   TEXT := NULL;
  v_mds         JSONB := '[]'::jsonb;
  v_first       JSONB := NULL;
  v_last_is_md  BOOLEAN := false;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 조회할 수 있어요');
  END IF;

  -- 1) 파티 채팅 통계 (MD 초대와 무관하게 항상)
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

  -- 2) 초대된 MD 전원 (없으면 빈 배열)
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'invited_at'), '[]'::jsonb)
    INTO v_mds
  FROM (
    SELECT jsonb_build_object(
             'md_id',           pm.md_id,
             'md_name',         COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD'),
             'md_instagram',    u.instagram,
             'invited_at',      pm.invited_at,
             'consented_at',    pm.consented_at,
             'offer_id',        pm.offer_id,
             'offer_price',     o.proposed_price,
             'offer_club_name', c.name,
             'offer_charged',   (o.charged_at IS NOT NULL),
             'chat_md',         (SELECT count(*) FROM puzzle_party_messages m
                                  WHERE m.puzzle_id = p_puzzle_id
                                    AND m.is_system = false AND m.is_deleted = false
                                    AND m.sender_id = pm.md_id)
           ) AS x
    FROM puzzle_party_md pm
    LEFT JOIN users u        ON u.id = pm.md_id
    LEFT JOIN puzzle_offers o ON o.id = pm.offer_id
    LEFT JOIN clubs c         ON c.id = o.club_id
    WHERE pm.puzzle_id = p_puzzle_id
  ) t;

  v_first := v_mds->0;
  IF v_last_sender IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM puzzle_party_md
      WHERE puzzle_id = p_puzzle_id AND md_id = v_last_sender
    ) INTO v_last_is_md;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    -- 파티 채팅 (항상)
    'chat_total',      COALESCE(v_total, 0),
    'chat_last_at',    v_last_at,
    'chat_last_name',  v_last_name,
    'chat_last_is_md', v_last_is_md,
    'chat_md',         COALESCE((v_first->>'chat_md')::int, 0),
    -- 다중 MD (신규) — 프론트는 이걸 우선 사용
    'mds',             v_mds,
    'md_count',        jsonb_array_length(v_mds),
    -- 하위호환 스칼라 (첫 MD 기준)
    'invited',         (jsonb_array_length(v_mds) > 0),
    'md_name',         v_first->>'md_name',
    'md_instagram',    v_first->>'md_instagram',
    'invited_at',      v_first->>'invited_at',
    'consented_at',    v_first->>'consented_at',
    'offer_id',        v_first->>'offer_id',
    'offer_price',     (v_first->>'offer_price')::int,
    'offer_club_name', v_first->>'offer_club_name',
    'offer_charged',   (v_first->>'offer_charged')::boolean
  );
END;
$$;
