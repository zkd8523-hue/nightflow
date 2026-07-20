-- ============================================================================
-- Migration 438: 어드민 게스트 간판 배정 — 멀티 슬롯 허용 + 미래 주 무제한
-- 날짜: 2026-07-09
-- 배경:
--   Migration 290의 admin_assign_hotdeal_slot()은 두 가지를 막고 있었다.
--     (1) 1MD 1주 1슬롯: 한 MD가 같은 주에 두 클럽 슬롯을 못 가짐
--     (2) 다다음주(+14일) 상한: 이번주 ~ 다다음주만 배정 가능
--   멀티 클럽 파트너(예: DM SEOUL + 아르쥬 청담을 동시에 운영하는 MD)의 경우
--   어드민이 재량으로 여러 클럽 슬롯을 배정할 수 있어야 win-win이다.
--
-- 변경점 (admin 배정 경로에만 적용):
--   - (1) 1MD 1주 1슬롯 체크 제거 → admin이 멀티 슬롯 배정 가능
--   - (2) +14일 상한 제거 → 미래 주 무제한 (과거 주는 계속 차단)
--
-- 유지되는 안전장치:
--   - 호출자 admin 확인
--   - 대상은 반드시 해당 클럽의 파트너 MD (club_partners)
--   - week_start 월요일 정합성
--   - 과거 주 차단
--   - 덮어쓰기 금지 (빈 슬롯만) + DB UNIQUE(club_id, week_start) → 한 클럽×주 = MD 1명
--
-- ⚠️ 유저 셀프 선착순(claim_hotdeal_slot, Migration 236)은 변경하지 않음 —
--    공개 선착순 시장은 여전히 1MD 1주 1슬롯으로 공정하게 유지.
--
-- ※ 이 함수는 프로덕션 대시보드에서 이미 수동 실행 완료 (2026-07-09). 본 파일은
--    설계도(migrations) 반영 및 DB 재구성/타 환경 배포 시 제약 부활 방지용 기록.
--    CREATE OR REPLACE라 재실행해도 안전 (idempotent).
--
-- 참조: 290_admin_assign_hotdeal_slot.sql, 236_hotdeal_week_unit.sql, 283_hotdeal_expires_18h.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_assign_hotdeal_slot(
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

  -- 3) week_start 월요일 정합성 + 과거 주 차단 (미래는 무제한 — Migration 290의 +14일 상한 제거)
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;
  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start THEN
    RETURN jsonb_build_object('success', false, 'error', '지난 주는 배정할 수 없어요');
  END IF;

  -- 4) 파트너 검증 (해당 클럽 파트너 MD만)
  SELECT EXISTS(
    SELECT 1 FROM club_partners
    WHERE club_id = p_club_id AND md_id = p_md_id
  ) INTO v_partner_exists;
  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
  END IF;

  -- 5) 덮어쓰기 금지: 빈 슬롯에만 (FOR UPDATE 잠금으로 레이스 안전)
  IF EXISTS(
    SELECT 1 FROM weekly_hotdeal_slots
    WHERE club_id = p_club_id AND week_start = p_week_start
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 차지된 슬롯이에요 (덮어쓰기 불가)');
  END IF;

  -- ★ 제거: 1MD 1주 1슬롯 룰 (Migration 290의 6번 블록) → admin 멀티 슬롯 배정 허용
  -- ★ 제거: 다다음주(+14일) 상한 (Migration 290의 3번 블록 상한) → 미래 주 무제한

  -- 6) INSERT — expires_at = week_start + 7일 18:00 KST (Migration 283과 동일)
  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
  INSERT INTO weekly_hotdeal_slots (club_id, md_id, week_start, benefits_by_dow, expires_at)
  VALUES (p_club_id, p_md_id, p_week_start, '{}'::JSONB, v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION admin_assign_hotdeal_slot(UUID, DATE, UUID) IS
  '어드민 전용: 빈 게스트 간판 슬롯에 특정 파트너 MD 배정. 멀티 슬롯 허용 + 미래 주 무제한(과거 차단), 덮어쓰기 금지. (Migration 438)';
