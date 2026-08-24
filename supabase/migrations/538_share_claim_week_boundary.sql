-- ============================================================================
-- Migration 538: claim_share_slot 주 경계를 get_my_share_slot_status와 일치시킴
-- 날짜: 2026-08-24
-- 배경:
--   운영권 주기는 "월 18시 ~ 다음 월 18시"(Migration 514)라, 월요일 18시 이전에는
--   아직 지난 주 슬롯이 유효하다. get_my_share_slot_status는 이 규칙대로 월요일
--   18시 전이면 week_start를 한 주 뒤로 돌린다.
--
--   그런데 claim_share_slot은 week_start_kst(today) — 순수 달력 기준 — 로만 이번
--   주를 계산했다. 월요일 18시 이전에 화면이 돌려받은 week_start(지난 주 월요일)로
--   자리 잡기를 누르면
--     p_week_start < v_current_week_start
--   가 되어 "이번 주 또는 다음 주만 차지할 수 있어요"가 떴다. 정작 오픈 시간
--   안내("매주 월요일 오후 6시에 오픈돼요")는 그 아래라 영영 도달하지 못했다.
--
--   → v_current_week_start에 같은 18시 롤백을 적용한다. 그러면
--     - 월 18시 이전: 지난 주 = 현재 주로 취급 → 범위 통과 → 오픈 게이트가
--       "매주 월요일 오후 6시에 오픈돼요"를 정확히 돌려준다
--     - 오픈 게이트의 기준 시각도 함께 교정된다(지난 주 월 18시는 이미 지났으므로,
--       월 18시 이전에도 아직 유효한 지난 주 자리는 정상적으로 잡을 수 있다)
--
--   본문의 나머지 로직은 Migration 521 그대로 유지한다.
-- ============================================================================

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
  v_hour_kst INT := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Seoul'))::INT;
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
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한이 필요해요');
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
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
    END IF;
  END IF;

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  -- 주 경계 = 월 18시 (Migration 538). 월요일 18시 이전이면 아직 지난 주가 현재 주다.
  v_current_week_start := week_start_kst(v_today_kst);
  IF EXTRACT(ISODOW FROM v_today_kst)::INT = 1 AND v_hour_kst < 18 THEN
    v_current_week_start := v_current_week_start - 7;
  END IF;

  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- 오픈 게이트: 해당 주 월요일 18시 (다음 주 미리 선점 허용) (admin 우회)
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

  -- 다음 주 선점 사재기 방지 (admin 우회): 이번 주 운영 중 + 운영 요일 2일 이상
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    IF NOT EXISTS (
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND md_id = v_md_id AND week_start = v_current_week_start
    ) THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주에 이 클럽을 운영해야 다음 주를 미리 선점할 수 있어요');
    END IF;

    v_days_set := share_next_week_days_set(v_md_id, p_club_id);
    IF COALESCE(v_days_set, 0) < 2 THEN
      RETURN jsonb_build_object('success', false,
        'error', '조각 운영 요일을 2일 이상 켜야 다음 주를 미리 선점할 수 있어요',
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
      RETURN jsonb_build_object('success', false, 'error', '해당 주에 이미 조각 자리를 차지하셨어요 (주당 1자리)');
    END IF;
  END IF;

  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start
    ) INTO v_existing_other_md;
    IF v_existing_other_md THEN
      RETURN jsonb_build_object('success', false, 'error', '해당 주 이 클럽 조각 자리는 다른 파트너가 이미 차지했어요');
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 조각 자리를 차지하셨어요');
    END IF;
  END IF;

  -- 구 요일표를 쓰던 MD의 스냅샷은 그대로 복사(없으면 빈 객체 — 상시 템플릿이 발행을 맡는다)
  IF p_week_start > v_current_week_start THEN
    SELECT COALESCE(jsonb_object_agg(dow, ids), '{}'::jsonb) INTO v_snapshot
    FROM (
      SELECT dow, jsonb_agg(option_id ORDER BY sort_order) AS ids
      FROM share_weekday_plan
      WHERE md_id = v_md_id AND club_id = p_club_id
      GROUP BY dow
    ) q;
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
    'week_start', p_week_start,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_share_slot(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION claim_share_slot(UUID, DATE) IS
  '조각(파티) 주간 운영권 선점. 주 경계는 월 18시(Migration 538) — get_my_share_slot_status와 동일.';
