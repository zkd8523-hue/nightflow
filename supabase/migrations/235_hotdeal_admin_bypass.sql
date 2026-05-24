-- ============================================================================
-- Migration 235: claim_hotdeal_slot — admin은 시간 가드 우회
-- 날짜: 2026-05-25
-- 설명:
--   admin 계정은 슬롯 오픈 시각(매주 월 18:00 KST) 이전에도 차지 가능.
--   "이미 지난 날짜" 가드는 유지 (overlap 막기 위함).
--   파트너 가드는 Migration 234와 동일하게 admin 우회.
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_hotdeal_slot(
  p_club_id UUID,
  p_slot_date DATE,
  p_benefit_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_now_kst TIMESTAMPTZ := now();
  v_week_start DATE;
  v_week_open_at TIMESTAMPTZ;
  v_partner_exists BOOLEAN;
  v_already_in_week BOOLEAN;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_admin BOOLEAN;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  -- 파트너 가드 (admin 우회)
  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
    END IF;
  END IF;

  -- 이번 주 범위 가드 (admin도 적용 — slot_date 범위 자체는 유효해야 함)
  v_week_start := week_start_kst(v_today_kst);
  IF p_slot_date < v_week_start OR p_slot_date >= v_week_start + 7 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주(월~일) 안의 날짜만 차지할 수 있어요'
    );
  END IF;

  -- 월요일 18:00 오픈 가드 (admin 우회 — 테스트/긴급 대응)
  IF NOT v_is_admin THEN
    v_week_open_at := (v_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '슬롯은 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- 이미 지난 날짜 가드 (admin도 적용 — 과거 슬롯은 의미 없음)
  IF p_slot_date < v_today_kst THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이미 지난 날짜는 차지할 수 없어요'
    );
  END IF;

  -- 같은 주 1MD 1슬롯 (admin도 적용 — 룰 일관성)
  SELECT EXISTS(
    SELECT 1 FROM weekly_hotdeal_slots
    WHERE md_id = v_md_id
      AND slot_date >= v_week_start
      AND slot_date < v_week_start + 7
  ) INTO v_already_in_week;
  IF v_already_in_week THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주에 이미 슬롯을 차지하셨어요 (주당 1슬롯)'
    );
  END IF;

  v_expires_at := ((p_slot_date + 1)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  BEGIN
    INSERT INTO weekly_hotdeal_slots (club_id, md_id, slot_date, benefit_text, expires_at)
    VALUES (p_club_id, v_md_id, p_slot_date, NULLIF(TRIM(p_benefit_text), ''), v_expires_at)
    RETURNING id INTO v_slot_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '다른 MD가 먼저 차지했어요'
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION claim_hotdeal_slot(UUID, DATE, TEXT) IS
  'HOT DEAL 슬롯 선착순 차지 (admin은 월 18시 가드 + 파트너 가드 우회)';
