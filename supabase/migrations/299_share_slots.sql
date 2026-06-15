-- ============================================================================
-- Migration 299: 조각(share) 전용 주 단위 클럽 선점 슬롯
-- 날짜: 2026-06-13
-- 배경:
--   조각(listing_type='share')의 유일성 제약은 idx_share_one_per_day_per_md
--   = (md_id, share_date) 하나뿐 → "한 MD가 같은 날 조각 1개"만 막고
--   클럽 기준 제약이 없다. 같은 클럽에 파트너 MD가 여럿이면 같은 밤에 각자
--   조각을 올려 서로 손님을 잠식(카니발리제이션)한다.
--
-- 해결:
--   게스트 간판(weekly_hotdeal_slots)과 "똑같은 형식"이되 독립된 조각 전용
--   선점 슬롯(weekly_share_slots)을 만든다. 클럽×주 = MD 1명.
--   그 클럽·그 주의 조각 슬롯을 선점한 MD만 조각을 등록할 수 있다(서버 게이트).
--
-- 왜 게스트 슬롯을 재사용하지 않는가:
--   게스트 간판과 조각 선점권은 서로 다른 MD가 가질 수 있어야 한다.
--   (예: B클럽 게스트=진우, 조각=병오) weekly_hotdeal_slots는 클럽×주 MD 1명
--   이라 재사용 시 충돌 → 별개 테이블 필수.
--
-- 게스트 간판과 동일:
--   - 주 단위(월18시~다음월18시 KST), 매주 월18시 오픈, 이번주+다음주만 선점
--   - 선착순 FOR UPDATE 락, 1MD 1주 1슬롯, 파트너만, 테스트 클럽('%운영자%') 우회
--   - expires_at = (week_start + 7) 18:00 KST
--
-- 게스트 간판과 다름:
--   - benefits_by_dow 없음 (조각은 혜택 텍스트 불필요, 선점만)
--   - 1MD 1주 카운트는 weekly_share_slots만 본다 (게스트와 별개 → 양쪽 선점 가능)
--
-- 참조: 234_hotdeal_slots.sql, 236_hotdeal_week_unit.sql, 283_hotdeal_expires_18h.sql
--   week_start_kst(DATE) 헬퍼는 234에서 이미 정의됨 → 재사용
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) weekly_share_slots 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_share_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 슬롯이 적용되는 주의 월요일 (KST)
  week_start DATE NOT NULL,
  -- 만료 시각 = 다음 주 월요일 18:00 KST (게스트 간판과 맞물림)
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 한 클럽 × 한 주 = 한 슬롯만 (선착순 보장 키)
  -- 테스트 클럽 동시 차지를 허용하려면 RPC 측 가드로 처리하므로
  -- 게스트 간판처럼 UNIQUE 제약 대신 RPC FOR UPDATE 락을 신뢰 경계로 둔다.
  CONSTRAINT weekly_share_slots_club_week_key UNIQUE(club_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_share_slot_md_week ON weekly_share_slots(md_id, week_start);
CREATE INDEX IF NOT EXISTS idx_share_slot_club_active
  ON weekly_share_slots(club_id, week_start, expires_at);

COMMENT ON TABLE weekly_share_slots IS
  '조각(share) 주 단위 선점 슬롯 (클럽×주=MD 1명). 게스트 간판과 독립.';
COMMENT ON COLUMN weekly_share_slots.week_start IS '슬롯이 적용되는 주의 월요일 (KST)';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION trg_share_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS share_slots_updated_at ON weekly_share_slots;
CREATE TRIGGER share_slots_updated_at
  BEFORE UPDATE ON weekly_share_slots
  FOR EACH ROW EXECUTE FUNCTION trg_share_slots_updated_at();

-- ----------------------------------------------------------------------------
-- 2) RLS: 누구나 SELECT, MD는 본인 슬롯만 변경. INSERT는 RPC로만.
-- ----------------------------------------------------------------------------
ALTER TABLE weekly_share_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read share slots"
  ON weekly_share_slots
  FOR SELECT
  USING (TRUE);

CREATE POLICY "MD can update own share slot"
  ON weekly_share_slots
  FOR UPDATE
  USING (auth.uid() = md_id);

CREATE POLICY "MD can delete own share slot"
  ON weekly_share_slots
  FOR DELETE
  USING (auth.uid() = md_id);

-- ----------------------------------------------------------------------------
-- 3) RPC: claim_share_slot — 조각 슬롯 차지 (283 claim_hotdeal_slot 복제)
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
        'error', '조각 자리는 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  --   ⚠️ weekly_share_slots만 카운트 (게스트 간판과 별개 → 한 MD가 양쪽 선점 가능)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'   -- 테스트 클럽 슬롯은 카운트에서 제외
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
    -- 테스트 클럽이라도 본인 중복은 차단
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 조각 자리를 차지하셨어요');
    END IF;
  END IF;

  -- 만료 = 다음 주 월요일 18:00 KST (오픈 게이트와 맞물림)
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
  '조각 슬롯 차지. 클럽×주=MD 1명. 게스트 간판과 별개 카운트(양쪽 선점 가능). expires_at=다음 월 18:00 KST.';

-- ----------------------------------------------------------------------------
-- 4) RPC: release_share_slot — 본인 슬롯 해제 (234 release_hotdeal_slot 복제)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_share_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT md_id INTO v_owner FROM weekly_share_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각 자리를 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 조각 자리만 해제할 수 있어요');
  END IF;

  DELETE FROM weekly_share_slots WHERE id = p_slot_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION release_share_slot(UUID) IS
  '조각 슬롯 해제 (본인 슬롯만)';
