-- ============================================================================
-- Migration 521: 조각 운영권 "다음 주도 차지하기" (게스트 간판과 동일한 리듬)
-- 날짜: 2026-08-05
-- 배경:
--   운영권은 주 단위(월 18시 ~ 다음 월 18시, Migration 514)라, 발행도 이번 주까지만
--   나간다. 오늘부터 7일치를 시도해도 다음 주 월·화는 슬롯이 없어 조용히 건너뛴다
--   ("왜 7건이 아니라 5건이지").
--
--   게스트 간판(weekly_hotdeal_slots, 234)에는 이미 "다음 주도 미리 선점"이 있다.
--   조각도 claim_share_slot이 다음 주를 받긴 하는데, 게이트가 share_weekday_plan
--   (v1 요일표)을 본다. 상시 조각은 auction_templates로 일원화했으므로 그 테이블은
--   영영 비어 있고, 결과적으로 다음 주 선점이 항상 막힌다.
--
--   → 두 가지를 고친다:
--     1) 다음 주 게이트를 상시 조각 템플릿 기준으로 — 이 클럽 켜진 템플릿의
--        운영 요일이 합쳐서 2일 이상이면 통과 (기존 요일표도 계속 인정)
--     2) get_my_share_slot_status가 다음 주 상태까지 함께 돌려준다
--        (화면이 두 번 물어보지 않도록)
--
--   사재기 방지 조건(이번 주 이 클럽을 운영 중일 것)은 그대로 둔다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 다음 주 선점 게이트 — 상시 조각 템플릿 요일도 인정
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION share_next_week_days_set(p_md_id UUID, p_club_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT GREATEST(
    -- 상시 조각: 켜진 템플릿들의 운영 요일 합집합
    COALESCE((
      SELECT COUNT(DISTINCT d)
      FROM auction_templates t, unnest(t.live_dows) AS d
      WHERE t.md_id = p_md_id
        AND t.club_id = p_club_id
        AND t.is_live = true
        AND t.listing_type = 'share'
    ), 0),
    -- 구 요일표(share_weekday_plan)를 쓰던 MD도 그대로 통과시킨다
    COALESCE((
      SELECT COUNT(DISTINCT dow)
      FROM share_weekday_plan
      WHERE md_id = p_md_id AND club_id = p_club_id
    ), 0)
  )::INTEGER;
$$;

COMMENT ON FUNCTION share_next_week_days_set IS
  '다음 주 조각 슬롯 선점 게이트용 — 이 클럽에 세팅된 운영 요일 수(상시 템플릿 ∪ 구 요일표).';

-- ----------------------------------------------------------------------------
-- 2) claim_share_slot — 게이트 계산만 위 함수로 교체 (431 본문 유지)
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

  -- 다음 주 선점 사재기 방지 (admin 우회): 이번 주 운영 중 + 운영 요일 2일 이상
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    IF NOT EXISTS (
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND md_id = v_md_id AND week_start = v_current_week_start
    ) THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주에 이 클럽을 운영해야 다음 주를 미리 선점할 수 있어요');
    END IF;

    -- 상시 조각 템플릿의 운영 요일로 판정한다 (Migration 521)
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

-- ----------------------------------------------------------------------------
-- 3) 상태 조회 — 다음 주까지 한 번에
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_share_slot_status()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_md UUID := auth.uid();
  v_kst TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Seoul';
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_week_start DATE;
  v_next_week DATE;
  v_rows JSON;
BEGIN
  IF v_md IS NULL THEN
    RETURN json_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  -- 이번 주 월요일. 단 월요일 18시 이전이면 아직 지난 주 슬롯이 유효(게스트 간판과 동일).
  v_week_start := v_today - (EXTRACT(ISODOW FROM v_today)::int - 1);
  IF EXTRACT(ISODOW FROM v_today)::int = 1 AND EXTRACT(HOUR FROM v_kst) < 18 THEN
    v_week_start := v_week_start - 7;
  END IF;
  v_next_week := v_week_start + 7;

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      c.id            AS club_id,
      c.name          AS club_name,
      s.md_id         AS holder_id,
      u.display_name  AS holder_name,
      (s.md_id = v_md) AS is_mine,
      s.week_start,
      s.expires_at,
      -- 다음 주 상태 — "다음 주도 차지하기" 버튼이 이 값으로 갈린다
      n.md_id         AS next_holder_id,
      nu.display_name AS next_holder_name,
      (n.md_id = v_md) AS next_is_mine,
      n.id            AS next_slot_id,
      share_next_week_days_set(v_md, c.id) AS days_set
    FROM club_partners cp
    JOIN clubs c ON c.id = cp.club_id
    LEFT JOIN weekly_share_slots s
      ON s.club_id = c.id AND s.week_start = v_week_start
    LEFT JOIN users u ON u.id = s.md_id
    LEFT JOIN weekly_share_slots n
      ON n.club_id = c.id AND n.week_start = v_next_week
    LEFT JOIN users nu ON nu.id = n.md_id
    WHERE cp.md_id = v_md
  ) x;

  RETURN json_build_object(
    'success', true,
    'week_start', v_week_start,
    'next_week_start', v_next_week,
    'clubs', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_share_slot_status() TO authenticated;

COMMENT ON FUNCTION get_my_share_slot_status IS
  '내 소속 클럽별 이번 주/다음 주 조각 운영권 보유자 + 운영 요일 수. 조각 섹션 진입 시 안내용.';
