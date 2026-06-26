-- ============================================================================
-- Migration 329: 조각 다음 주 요일표 스냅샷 (이번 주와 독립 편집)
-- 날짜: 2026-06-26
-- 배경:
--   share_weekday_plan은 클럽당 1장의 공유 템플릿이라 다음 주를 따로 세팅할 수 없다.
--   "다음 주 선점" 시 그 순간의 요일표를 슬롯에 스냅샷으로 복사해두고,
--   "다음 주 설정"에서 스냅샷만 따로 편집한다(이번 주 템플릿은 안 건드림).
--
--   롤오버: 다음 주가 이번 주가 되는 월요일, generate-share-listings(cron)이
--   그 주 슬롯의 plan_snapshot을 share_weekday_plan으로 승격하고 스냅샷을 비운다.
--   → 항상 "이번 주 = share_weekday_plan" 일관성 유지. (cron 측에서 처리)
--
-- 참조: 299/328 claim_share_slot, 303 set_share_weekday_plan, 305 generate-share-listings
-- ============================================================================

-- 1) 스냅샷 컬럼: { "mon": [optionId,...], "tue": [...], ... }. NULL = 스냅샷 없음(이번 주 슬롯).
ALTER TABLE weekly_share_slots
  ADD COLUMN IF NOT EXISTS plan_snapshot JSONB;

COMMENT ON COLUMN weekly_share_slots.plan_snapshot IS
  '다음 주 요일표 스냅샷 {dow:[option_id]}. 선점 시 복사, 롤오버 시 share_weekday_plan으로 승격 후 NULL.';

-- ----------------------------------------------------------------------------
-- 2) claim_share_slot 재정의 (328 기반 + 다음 주 선점 시 요일표 스냅샷 복사)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_share_slot(
  p_club_id UUID,
  p_week_start DATE
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
  v_current_week_start DATE;
  v_week_open_at TIMESTAMPTZ;
  v_partner_exists BOOLEAN;
  v_already_in_week BOOLEAN;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_existing_other_md BOOLEAN;
  v_days_set INTEGER;
  v_snapshot JSONB;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  SELECT name LIKE '%운영자%' INTO v_is_test_club
    FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
    END IF;
  END IF;

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- 오픈 게이트: 이번 주 기준 (다음 주 미리 선점 허용) (admin 우회)
  IF NOT v_is_admin THEN
    v_week_open_at := (v_current_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '조각 자리는 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- 다음 주 선점 사재기 방지 (admin 우회): 이번 주 운영 중 + 요일표 2일 이상
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    IF NOT EXISTS (
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND md_id = v_md_id AND week_start = v_current_week_start
    ) THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주에 이 클럽을 운영해야 다음 주를 미리 선점할 수 있어요');
    END IF;

    SELECT COUNT(DISTINCT dow) INTO v_days_set
    FROM share_weekday_plan
    WHERE md_id = v_md_id AND club_id = p_club_id;
    IF COALESCE(v_days_set, 0) < 2 THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주 요일표를 2일 이상 세팅해야 다음 주를 미리 선점할 수 있어요',
        'days_set', COALESCE(v_days_set, 0),
        'days_required', 2);
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) INTO v_already_in_week;
    IF v_already_in_week THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주에 이미 조각 자리를 차지하셨어요 (주당 1자리)');
    END IF;
  END IF;

  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start
      FOR UPDATE
    ) INTO v_existing_other_md;
    IF v_existing_other_md THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주 이 클럽 조각 자리는 다른 MD가 이미 차지했어요');
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 조각 자리를 차지하셨어요');
    END IF;
  END IF;

  -- 다음 주 선점이면 현재 요일표를 스냅샷으로 복사 (이번 주는 NULL → 공유 템플릿 사용)
  IF p_week_start > v_current_week_start THEN
    SELECT COALESCE(jsonb_object_agg(dow, ids), '{}'::jsonb) INTO v_snapshot
    FROM (
      SELECT dow, jsonb_agg(option_id ORDER BY sort_order) AS ids
      FROM share_weekday_plan
      WHERE md_id = v_md_id AND club_id = p_club_id
      GROUP BY dow
    ) t;
  ELSE
    v_snapshot := NULL;
  END IF;

  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  INSERT INTO weekly_share_slots (club_id, md_id, week_start, expires_at, plan_snapshot)
  VALUES (p_club_id, v_md_id, p_week_start, v_expires_at, v_snapshot)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at,
    'is_test_club', v_is_test_club
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3) set_share_slot_plan — 다음 주 슬롯의 요일표 스냅샷 1개 요일 갱신 (본인만)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_share_slot_plan(
  p_slot_id UUID,
  p_dow TEXT,
  p_option_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_md IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  IF p_dow NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
    RETURN jsonb_build_object('success', false, 'error', '잘못된 요일');
  END IF;

  SELECT md_id INTO v_owner FROM weekly_share_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '슬롯을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 슬롯만 수정할 수 있어요');
  END IF;

  UPDATE weekly_share_slots
  SET plan_snapshot = jsonb_set(
        COALESCE(plan_snapshot, '{}'::jsonb),
        ARRAY[p_dow],
        to_jsonb(p_option_ids),
        true
      )
  WHERE id = p_slot_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION set_share_slot_plan(UUID, TEXT, UUID[]) IS
  '다음 주 슬롯 요일표 스냅샷의 한 요일 배정을 갱신 (본인 슬롯만).';
