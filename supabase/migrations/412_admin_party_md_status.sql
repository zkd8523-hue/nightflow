-- ============================================================================
-- Migration 412: admin이 MD 직통 조각의 "상담중" 상태를 확인하는 RPC
-- 날짜: 2026-07-06
-- 설명:
--   MD 직통 조각(host_is_md)은 다른 MD 오퍼가 차단(367)돼 시크릿오퍼 섹션이 항상 비어있음.
--   대신 puzzle_party_md(단체채팅에 초대된 MD)로 "상담중" 여부를 판단.
--   puzzle_party_md RLS는 참여자·본인 MD만 SELECT 가능 → admin 전용 RPC로 우회 조회.
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_party_md_status(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_row RECORD;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 조회할 수 있어요');
  END IF;

  SELECT
    pm.md_id, pm.invited_at,
    u.display_name, u.name, u.instagram
  INTO v_row
  FROM puzzle_party_md pm
  JOIN users u ON u.id = pm.md_id
  WHERE pm.puzzle_id = p_puzzle_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', true, 'invited', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invited', true,
    'md_id', v_row.md_id,
    'md_name', COALESCE(v_row.display_name, v_row.name, 'MD'),
    'md_instagram', v_row.instagram,
    'invited_at', v_row.invited_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION admin_get_party_md_status(UUID) TO authenticated;
