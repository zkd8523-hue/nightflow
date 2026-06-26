-- ============================================================================
-- Migration 328: 다음 주 미리 선점 + 이번 주 사용량 게이트
-- 날짜: 2026-06-26
-- 배경:
--   기존 claim_share_slot / claim_hotdeal_slot은 "대상 주(p_week_start)의 월요일
--   18시"가 지나야만 선점 가능 → 다음 주를 미리 선점할 수 없었다(283/299 오픈 게이트).
--   매주 월 18시에 다시 들어와 선점·세팅하는 수고를 덜기 위해, 이번 주가 열려 있으면
--   다음 주 자리도 미리 잡아둘 수 있게 한다.
--
-- 변경:
--   1) 오픈 게이트 기준을 p_week_start → v_current_week_start(이번 주)로 변경.
--      → 이번 주가 열려 있으면(이번 월 18시 이후) 다음 주도 선점 가능.
--      → 이번 주 오픈 전(월 00:00~17:59)에는 여전히 둘 다 차단.
--      (선점 가능 범위 ±7일 상한 + 1MD 1주 1슬롯 규칙은 그대로 → "다음 주 최대 1자리")
--
--   2) 사재기 방지 게이트: 다음 주 선점은 "이번 주에 실제로 운영 중"인 MD만 가능.
--      - 조각: 이번 주 같은 클럽 슬롯 보유 + 요일표(share_weekday_plan) 2일 이상 세팅
--      - 게스트 간판: 이번 주 슬롯의 혜택이 2일 이상 입력됨
--      (admin은 우회)
--
-- 참조: 299_share_slots.sql, 283_hotdeal_expires_18h.sql
-- ============================================================================

-- 다음 주 선점 허용을 위한 이번 주 최소 세팅 일수
--   (상수: 추후 조절 시 두 함수의 < 2 비교만 바꾸면 됨)

-- ----------------------------------------------------------------------------
-- 1) claim_share_slot 재정의 (299 기반)
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

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- ⬇️ 변경점: 오픈 게이트를 "이번 주" 기준으로 (다음 주 미리 선점 허용) (admin 우회)
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

  -- ⬇️ 신규: 다음 주 선점 사재기 방지 (admin 우회)
  --   이번 주 같은 클럽을 운영 중 + 요일표 2일 이상 세팅한 MD만 다음 주를 미리 잡을 수 있다.
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

  -- 같은 클럽 다른 MD 차지 여부 (테스트 클럽 우회) — FOR UPDATE 락으로 선착순 보장
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

  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  INSERT INTO weekly_share_slots (club_id, md_id, week_start, expires_at)
  VALUES (p_club_id, v_md_id, p_week_start, v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at,
    'is_test_club', v_is_test_club
  );
END;
$$;

COMMENT ON FUNCTION claim_share_slot(UUID, DATE) IS
  '조각 슬롯 차지. 다음 주 미리 선점 허용(이번 주 운영+요일표 2일↑ 필요). 클럽×주=MD 1명.';

-- ----------------------------------------------------------------------------
-- 2) claim_hotdeal_slot 재정의 (283 기반)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_hotdeal_slot(
  p_club_id UUID,
  p_week_start DATE,
  p_benefits_by_dow JSONB DEFAULT '{}'::JSONB
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

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- ⬇️ 변경점: 오픈 게이트를 "이번 주" 기준으로 (다음 주 미리 선점 허용) (admin 우회)
  IF NOT v_is_admin THEN
    v_week_open_at := (v_current_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '슬롯은 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- ⬇️ 신규: 다음 주 선점 사재기 방지 (admin 우회)
  --   이번 주 슬롯의 혜택이 2일 이상 입력돼 있어야 다음 주를 미리 잡을 수 있다.
  --   (이번 주 슬롯이 없으면 카운트 0 → 자연 차단)
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    SELECT COUNT(*) INTO v_days_set
    FROM weekly_hotdeal_slots s
    CROSS JOIN LATERAL jsonb_object_keys(s.benefits_by_dow) AS k(key)
    WHERE s.md_id = v_md_id
      AND s.club_id = p_club_id
      AND s.week_start = v_current_week_start
      AND (
        (jsonb_typeof(s.benefits_by_dow -> k.key) = 'array'
          AND jsonb_array_length(s.benefits_by_dow -> k.key) > 0)
        OR (jsonb_typeof(s.benefits_by_dow -> k.key) = 'string'
          AND length(btrim(s.benefits_by_dow ->> k.key)) > 0)
      );
    IF COALESCE(v_days_set, 0) < 2 THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주 혜택을 2일 이상 입력해야 다음 주를 미리 선점할 수 있어요',
        'days_set', COALESCE(v_days_set, 0),
        'days_required', 2);
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) INTO v_already_in_week;
    IF v_already_in_week THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주에 이미 슬롯을 차지하셨어요 (주당 1슬롯)');
    END IF;
  END IF;

  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots
      WHERE club_id = p_club_id AND week_start = p_week_start
      FOR UPDATE
    ) INTO v_existing_other_md;
    IF v_existing_other_md THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주 이 클럽은 다른 MD가 이미 차지했어요');
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 슬롯을 차지하셨어요');
    END IF;
  END IF;

  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  INSERT INTO weekly_hotdeal_slots (club_id, md_id, week_start, benefits_by_dow, expires_at)
  VALUES (p_club_id, v_md_id, p_week_start, COALESCE(p_benefits_by_dow, '{}'::JSONB), v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at,
    'is_test_club', v_is_test_club
  );
END;
$$;

COMMENT ON FUNCTION claim_hotdeal_slot(UUID, DATE, JSONB) IS
  'HOT DEAL 슬롯 차지. 다음 주 미리 선점 허용(이번 주 혜택 2일↑ 필요). 테스트 클럽 우회.';
