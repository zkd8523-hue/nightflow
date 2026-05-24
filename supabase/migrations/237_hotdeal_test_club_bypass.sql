-- ============================================================================
-- Migration 237: HOT DEAL 테스트 클럽 (이름에 '운영자' 포함) 동시 차지 허용
-- 날짜: 2026-05-25
-- 설명:
--   클럽 이름에 "운영자" 들어가는 클럽은 테스트용 → 여러 MD가 동시 차지 가능
--   + 같은 MD가 한 주에 1슬롯 룰도 우회 (테스트 후 진짜 슬롯도 차지 가능)
--
--   구현:
--     - UNIQUE(club_id, week_start) 제약은 그대로 두고 ON CONFLICT DO NOTHING
--       후 ON CONFLICT 발생 시 INSERT new row (PK는 다르게)
--     → 실제로는 UNIQUE 제약 자체를 partial index로 변경하는 게 깔끔
--
--   결정: 제약 삭제 + 테스트 클럽 제외 partial unique index로 교체
-- ============================================================================

-- 1) 기존 UNIQUE 제약 제거
ALTER TABLE weekly_hotdeal_slots
  DROP CONSTRAINT IF EXISTS weekly_hotdeal_slots_club_week_key;

-- 2) 테스트 클럽 제외 partial unique index
--    is_test_club_by_name(club_id) IMMUTABLE 안 됨 (SELECT 필요) → JOIN 불가
--    대신 RPC 측에서 가드 + 일반 UNIQUE index는 다시 유지하지 않음
--    → 모든 클럽에 multiple INSERT 허용, RPC가 정상 클럽만 막음
--
--    문제: 정상 클럽에서 race condition 발생 가능 (두 MD 동시 차지)
--    해결: RPC 안에서 SELECT FOR UPDATE 후 INSERT
-- ============================================================================

-- 3) claim_hotdeal_slot 재정의 — 테스트 클럽 우회 + race-safe
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

  v_expires_at := ((p_week_start + 7)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

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
  'HOT DEAL 슬롯 차지. 테스트 클럽(이름 ~%운영자%)은 동시 차지 + 1MD 1주 룰 우회.';
