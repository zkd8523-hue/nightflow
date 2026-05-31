-- ============================================================================
-- Migration 283: 게스트 간판 슬롯 로테이션 단위 정합 (월 18:00 ~ 다음 월 18:00)
-- 날짜: 2026-06-01
-- 배경:
--   슬롯 차지(claim)는 매주 월요일 18:00 KST에 오픈되는데,
--   expires_at은 "week_start + 7일 00:00 KST"로 설정돼 있어 18시간 어긋났다.
--   → 다음 주 월요일 00:00~17:59 KST 구간에 지난 주 슬롯이 만료로 사라지고
--     새 주 슬롯은 아직 오픈 전(18시)이라, 게스트 간판이 통째로 비어 보였다.
--
-- 수정:
--   로테이션 단위를 [월 18:00, 다음 월 18:00) 으로 통일.
--   1) claim_hotdeal_slot(): expires_at 계산을 +7일 18:00 KST로 변경
--   2) 이미 발급된 기존 슬롯: expires_at += 18시간 백필
--      (기존 00:00 → 18:00 으로 맞물림)
--
-- 참조: 237_hotdeal_test_club_bypass.sql (직전 활성 버전), 236_hotdeal_week_unit.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) claim_hotdeal_slot 재정의 — expires_at만 +7일 18:00으로 변경
--    (237 버전을 그대로 가져오고 v_expires_at 계산 1줄만 수정)
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
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  -- 테스트 클럽 판별 (이름에 '운영자' 포함)
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

  -- week_start 정합성
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- 월 18시 오픈 가드 (admin 우회)
  IF NOT v_is_admin THEN
    v_week_open_at := (p_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '슬롯은 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'   -- 테스트 클럽 슬롯은 카운트에서 제외
    ) INTO v_already_in_week;
    IF v_already_in_week THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주에 이미 슬롯을 차지하셨어요 (주당 1슬롯)');
    END IF;
  END IF;

  -- 같은 클럽 다른 MD 차지 여부 (테스트 클럽 우회)
  --   기존 UNIQUE 제약은 제거됐으므로 RPC 측에서 직접 가드
  --   같은 (club_id, week_start, md_id) 본인 중복도 막아야 함
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
    -- 테스트 클럽이라도 본인 중복은 차단
    IF EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 슬롯을 차지하셨어요');
    END IF;
  END IF;

  -- ⬇️ 변경점: 만료 = 다음 주 월요일 18:00 KST (오픈 게이트와 정확히 맞물림)
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
  'HOT DEAL 슬롯 차지. 테스트 클럽(이름 ~%운영자%)은 동시 차지 + 1MD 1주 룰 우회. expires_at=다음 월 18:00 KST.';

-- ----------------------------------------------------------------------------
-- 2) 기존 슬롯 백필: expires_at 00:00 → 18:00 (정확히 +18시간)
--    week_start + 7일 18:00 KST와 일치하도록 보정.
--    (기존 값이 이미 18:00이면 영향 없도록 00:00(=KST) 정각만 대상으로 한정)
-- ----------------------------------------------------------------------------
UPDATE weekly_hotdeal_slots
SET expires_at = ((week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
WHERE expires_at IS DISTINCT FROM
      ((week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
