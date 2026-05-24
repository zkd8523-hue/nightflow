-- ============================================================================
-- Migration 234: HOT DEAL 주 단위 슬롯 판매 (Phase 1 — 무료 베타)
-- 날짜: 2026-05-25
-- 설명:
--   클럽 × 요일 = MD 1명이 차지하는 광고 슬롯. 차지한 MD가 그 요일 동안
--   클럽 단위 혜택 정보(자유 텍스트)를 노출할 권한을 가짐.
--
-- 룰:
--   - 슬롯 단위: 클럽 × 요일 (1주 = 클럽당 7개)
--   - 차지 방식: 선착순 (베타 무료, Phase 2에서 크레딧 차감 예정)
--   - 오픈 시점: 매주 월 18:00 KST → 그 주 7일치 동시 오픈
--   - 1인 제한: 같은 주(월~일)에 1슬롯만 차지 가능
--   - owner 특권: 없음 (일반 MD와 동일)
--   - 본문: benefit_text 자유 텍스트, expires_at은 slot_date 다음날 00:00 KST 기본
--
-- 후속 PR (Phase 2):
--   - 요일별 크레딧 가격 + claim_hotdeal_slot 안에 차감 로직
--   - 푸시 알림 (찜한 클럽이 슬롯 등록 시)
-- ============================================================================

-- ============================================================================
-- 1) weekly_hotdeal_slots 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_hotdeal_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 슬롯이 적용되는 날짜 (그 요일 1일치, KST)
  slot_date DATE NOT NULL,
  -- 혜택 본문 (자유 텍스트, 차지 시점엔 NULL 허용 → 나중에 update)
  benefit_text TEXT,
  -- 만료 시각 (기본: slot_date 다음날 00:00 KST = UTC 15:00 전날)
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 한 클럽 × 한 날짜 = 한 슬롯만 (선착순 보장 키)
  UNIQUE(club_id, slot_date)
);

CREATE INDEX IF NOT EXISTS idx_hotdeal_md_date ON weekly_hotdeal_slots(md_id, slot_date);
-- Postgres는 인덱스 predicate에 now() 같은 STABLE/VOLATILE 함수 금지 → 단순 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_hotdeal_club_active
  ON weekly_hotdeal_slots(club_id, slot_date, expires_at);

COMMENT ON TABLE weekly_hotdeal_slots IS
  'HOT DEAL 주 단위 슬롯 (클럽×요일=MD 1명, Phase 1 무료 선착순)';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION trg_hotdeal_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hotdeal_slots_updated_at ON weekly_hotdeal_slots;
CREATE TRIGGER hotdeal_slots_updated_at
  BEFORE UPDATE ON weekly_hotdeal_slots
  FOR EACH ROW EXECUTE FUNCTION trg_hotdeal_slots_updated_at();

-- ============================================================================
-- 2) RLS: 누구나 활성 슬롯 SELECT, MD는 본인 슬롯만 변경
-- ============================================================================
ALTER TABLE weekly_hotdeal_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active slots"
  ON weekly_hotdeal_slots
  FOR SELECT
  USING (TRUE);

CREATE POLICY "MD can update own slot"
  ON weekly_hotdeal_slots
  FOR UPDATE
  USING (auth.uid() = md_id);

CREATE POLICY "MD can delete own slot"
  ON weekly_hotdeal_slots
  FOR DELETE
  USING (auth.uid() = md_id);

-- INSERT는 RPC로만 (선착순/주 1슬롯 가드 적용)

-- ============================================================================
-- 3) 헬퍼: 주어진 날짜가 속한 주의 월요일 (KST 기준)
-- ============================================================================
CREATE OR REPLACE FUNCTION week_start_kst(p_date DATE)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow INT;
BEGIN
  -- PostgreSQL DOW: 0=일, 1=월, ..., 6=토
  v_dow := EXTRACT(DOW FROM p_date)::INT;
  -- 월요일까지 거슬러 (일요일이면 6일 전, 월요일이면 0일 전)
  IF v_dow = 0 THEN
    RETURN p_date - 6;
  ELSE
    RETURN p_date - (v_dow - 1);
  END IF;
END;
$$;

COMMENT ON FUNCTION week_start_kst(DATE) IS
  '주어진 날짜가 속한 주의 월요일 반환 (월=주 시작)';

-- ============================================================================
-- 4) RPC: claim_hotdeal_slot
--   가드:
--     - 인증 + MD/admin 권한
--     - club_partners로 클럽에 연결됐는지
--     - slot_date가 현재 주(월~일) 이내
--     - 그 주 월요일 18:00 KST 이후 (오픈 시점)
--     - 같은 주에 본인 다른 슬롯 없음
--     - 동일 club×slot_date 중복 없음 (UNIQUE 위반 시 친절 메시지)
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
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  -- 권한 체크
  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;

  -- club_partners 연결 확인 (admin은 우회)
  IF v_role <> 'admin' THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
    END IF;
  END IF;

  -- slot_date가 이번 주 안인지
  v_week_start := week_start_kst(v_today_kst);
  IF p_slot_date < v_week_start OR p_slot_date >= v_week_start + 7 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주(월~일) 안의 날짜만 차지할 수 있어요'
    );
  END IF;

  -- 그 주 월요일 18:00 KST 이후인지
  v_week_open_at := (v_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
  IF v_now_kst < v_week_open_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '슬롯은 매주 월요일 오후 6시에 오픈돼요',
      'open_at', v_week_open_at
    );
  END IF;

  -- 이미 지나간 날짜는 차단
  IF p_slot_date < v_today_kst THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이미 지난 날짜는 차지할 수 없어요'
    );
  END IF;

  -- 같은 주 1MD 1슬롯 제한
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

  -- 만료 시각: slot_date 다음날 00:00 KST
  v_expires_at := ((p_slot_date + 1)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  -- INSERT (UNIQUE 위반 = 누가 먼저 차지함)
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
  'HOT DEAL 슬롯 선착순 차지 (가드: 파트너 + 이번주 + 월18시 이후 + 주1슬롯 + 중복차단)';

-- ============================================================================
-- 5) RPC: update_hotdeal_benefit (본문만 갱신)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_hotdeal_benefit(
  p_slot_id UUID,
  p_benefit_text TEXT
)
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

  SELECT md_id INTO v_owner FROM weekly_hotdeal_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '슬롯을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 슬롯만 수정할 수 있어요');
  END IF;

  UPDATE weekly_hotdeal_slots
    SET benefit_text = NULLIF(TRIM(p_benefit_text), '')
    WHERE id = p_slot_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_hotdeal_benefit(UUID, TEXT) IS
  'HOT DEAL 슬롯 본문 갱신 (본인 슬롯만)';

-- ============================================================================
-- 6) RPC: release_hotdeal_slot (본인 슬롯 해제, 같은 주 다른 슬롯 차지 가능)
-- ============================================================================
CREATE OR REPLACE FUNCTION release_hotdeal_slot(p_slot_id UUID)
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

  SELECT md_id INTO v_owner FROM weekly_hotdeal_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '슬롯을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 슬롯만 해제할 수 있어요');
  END IF;

  DELETE FROM weekly_hotdeal_slots WHERE id = p_slot_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION release_hotdeal_slot(UUID) IS
  'HOT DEAL 슬롯 해제 (본인 슬롯만)';
