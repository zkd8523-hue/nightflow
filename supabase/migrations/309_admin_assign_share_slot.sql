-- ============================================================================
-- Migration 309: 어드민 조각(share) 슬롯 배정/해제 RPC
-- 날짜: 2026-06-16
-- 배경:
--   299_share_slots.sql에서 조각 전용 주 단위 선점 슬롯(weekly_share_slots,
--   클럽×주=MD 1명)과 선착순 차지 RPC(claim_share_slot)를 만들었다.
--   하지만 claim_share_slot()은 호출자 본인(auth.uid())을 슬롯에 INSERT 하므로
--   어드민이 *다른 MD*를 조각 슬롯에 사전 배정할 수 없다.
--
--   게스트 간판은 이미 admin_assign_hotdeal_slot(290)으로 어드민 사전 배정이
--   가능하다. 조각도 똑같이 클럽×주별 담당 MD를 어드민이 직접 선점하는
--   전용 함수를 추가한다.
--
-- 확정 규칙 (290 게스트 간판과 동일하되 weekly_share_slots 대상):
--   1. 호출자는 admin이어야 함 (auth.uid() 기준)
--   2. 슬롯에 들어갈 MD = 파라미터 p_md_id, 반드시 해당 클럽의 파트너 MD
--   3. 덮어쓰기 금지 — 이미 차지된 (club_id, week_start)에는 배정 불가 (빈 슬롯만)
--   4. 시간 게이트(월 18:00) 우회 — 사전 선점 허용
--   5. week 범위: 이번 주 ~ 다음 주(+7일)  ← 조각은 claim_share_slot과 동일하게 +7
--   6. 1MD 1주 1슬롯 룰 유지, weekly_share_slots만 카운트 (게스트와 별개)
--   7. expires_at = (week_start + 7) 18:00 KST (299와 동일)
--   8. 테스트 클럽('%운영자%')은 1MD 1주 룰 우회
--
-- 빈 슬롯 MD 선착순(claim_share_slot)은 변경하지 않는다.
-- 참조: 290_admin_assign_hotdeal_slot.sql, 299_share_slots.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) admin_assign_share_slot — 빈 조각 슬롯에 특정 MD 배정
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_assign_share_slot(
  p_club_id UUID,
  p_week_start DATE,
  p_md_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_role TEXT;
  v_md_role TEXT;
  v_partner_exists BOOLEAN;
  v_is_test_club BOOLEAN;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_current_week_start DATE;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1) 호출자 admin 확인
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller;
  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요해요');
  END IF;

  -- 2) 배정 대상 MD 유효성
  SELECT role INTO v_md_role FROM users WHERE id = p_md_id;
  IF v_md_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상 유저를 찾을 수 없어요');
  END IF;
  IF v_md_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD가 아니에요');
  END IF;

  -- 3) week_start 정합성 + 범위(이번주 ~ 다음주)
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;
  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 ~ 다음 주만 배정할 수 있어요');
  END IF;

  -- 4) 파트너 검증 (해당 클럽 파트너 MD만)
  SELECT EXISTS(
    SELECT 1 FROM club_partners
    WHERE club_id = p_club_id AND md_id = p_md_id
  ) INTO v_partner_exists;
  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
  END IF;

  -- 테스트 클럽 판별 (1MD 1주 룰 우회용)
  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  -- 5) 덮어쓰기 금지: 빈 슬롯에만 (FOR UPDATE 잠금으로 레이스 안전)
  IF EXISTS(
    SELECT 1 FROM weekly_share_slots
    WHERE club_id = p_club_id AND week_start = p_week_start
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 차지된 조각 자리예요 (덮어쓰기 불가)');
  END IF;

  -- 6) 1MD 1주 1슬롯 룰 (테스트 클럽 제외, weekly_share_slots만 카운트)
  IF NOT v_is_test_club THEN
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = p_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이 MD는 해당 주에 이미 다른 조각 자리를 보유 중이에요');
    END IF;
  END IF;

  -- 7) INSERT
  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
  INSERT INTO weekly_share_slots (club_id, md_id, week_start, expires_at)
  VALUES (p_club_id, p_md_id, p_week_start, v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION admin_assign_share_slot(UUID, DATE, UUID) IS
  '어드민 전용: 빈 조각 슬롯에 특정 파트너 MD를 사전 배정(시간 게이트 우회, 덮어쓰기 금지).';

-- ----------------------------------------------------------------------------
-- 2) admin_release_share_slot — 어드민이 임의 조각 슬롯 해제
--    (release_share_slot은 본인 슬롯만 가능하므로 어드민용 별도)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_release_share_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_deleted INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요해요');
  END IF;

  DELETE FROM weekly_share_slots WHERE id = p_slot_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '조각 자리를 찾을 수 없어요');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION admin_release_share_slot(UUID) IS
  '어드민 전용: 조각 슬롯 해제(선착순/배정 무관). 해제 후 빈 슬롯으로 돌아감.';
