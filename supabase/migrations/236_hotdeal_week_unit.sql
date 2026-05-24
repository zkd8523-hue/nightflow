-- ============================================================================
-- Migration 236: HOT DEAL 슬롯 단위를 "요일"→"주"로 변경 + 요일별 혜택 분리
-- 날짜: 2026-05-25
-- 설명:
--   사용자 의도와 정렬: 1슬롯 = 1주(월~일 7일 통째). 같은 MD가 1주를 차지하고
--   요일별로 다른 혜택 텍스트 입력 가능 (월=무료입장, 토=프리드링크).
--
-   1MD 1주 1클럽 룰은 유지 (한 MD는 한 주에 한 클럽만).
--
--   변경:
--     - slot_date DATE → week_start DATE (그 주 월요일)
--     - benefit_text TEXT → benefits_by_dow JSONB ({"mon":"...","tue":"...",...,"sun":"..."})
--     - UNIQUE(club_id, slot_date) → UNIQUE(club_id, week_start)
--     - expires_at = week_start + 7일 00:00 KST
--
--   기존 데이터는 베타 테스트라 TRUNCATE (PROD 적용 X 가정).
-- ============================================================================

-- 1) 기존 데이터 정리 (베타 단계)
TRUNCATE TABLE weekly_hotdeal_slots;

-- 2) 컬럼 재구성
ALTER TABLE weekly_hotdeal_slots DROP CONSTRAINT IF EXISTS weekly_hotdeal_slots_club_id_slot_date_key;
ALTER TABLE weekly_hotdeal_slots RENAME COLUMN slot_date TO week_start;
ALTER TABLE weekly_hotdeal_slots ADD CONSTRAINT weekly_hotdeal_slots_club_week_key UNIQUE(club_id, week_start);

ALTER TABLE weekly_hotdeal_slots DROP COLUMN IF EXISTS benefit_text;
ALTER TABLE weekly_hotdeal_slots
  ADD COLUMN IF NOT EXISTS benefits_by_dow JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN weekly_hotdeal_slots.week_start IS '슬롯이 적용되는 주의 월요일 (KST)';
COMMENT ON COLUMN weekly_hotdeal_slots.benefits_by_dow IS
  '요일별 혜택 텍스트. 키: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun" (예: {"mon":"여성 무료입장","sat":"프리드링크 1잔"})';

-- 인덱스 갱신
DROP INDEX IF EXISTS idx_hotdeal_md_date;
DROP INDEX IF EXISTS idx_hotdeal_club_active;
CREATE INDEX IF NOT EXISTS idx_hotdeal_md_week ON weekly_hotdeal_slots(md_id, week_start);
CREATE INDEX IF NOT EXISTS idx_hotdeal_club_active ON weekly_hotdeal_slots(club_id, week_start, expires_at);

-- 3) RPC: claim_hotdeal_slot (week 단위)
--    파라미터를 week_start로 받고, 한 주를 통째로 차지
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

  -- week_start는 반드시 그 주의 월요일이어야 함
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'week_start는 월요일이어야 해요'
    );
  END IF;

  -- 이번 주 또는 다음 주만 차지 가능 (admin도 동일)
  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주 또는 다음 주만 차지할 수 있어요'
    );
  END IF;

  -- 월요일 18:00 오픈 가드 (admin 우회)
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

  -- 같은 주에 본인이 다른 클럽 차지했는지 (1MD 1주 1슬롯)
  SELECT EXISTS(
    SELECT 1 FROM weekly_hotdeal_slots
    WHERE md_id = v_md_id AND week_start = p_week_start
  ) INTO v_already_in_week;
  IF v_already_in_week THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주에 이미 슬롯을 차지하셨어요 (주당 1슬롯)'
    );
  END IF;

  v_expires_at := ((p_week_start + 7)::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  BEGIN
    INSERT INTO weekly_hotdeal_slots (club_id, md_id, week_start, benefits_by_dow, expires_at)
    VALUES (p_club_id, v_md_id, p_week_start, COALESCE(p_benefits_by_dow, '{}'::JSONB), v_expires_at)
    RETURNING id INTO v_slot_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이번 주 이 클럽은 다른 MD가 이미 차지했어요'
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION claim_hotdeal_slot(UUID, DATE, JSONB) IS
  'HOT DEAL 주 단위 슬롯 선착순 차지 (1MD 1주 1클럽, admin은 시간/파트너 가드 우회)';

-- 4) update_hotdeal_benefit: 요일별 혜택 단건 갱신
DROP FUNCTION IF EXISTS update_hotdeal_benefit(UUID, TEXT);

CREATE OR REPLACE FUNCTION update_hotdeal_benefit(
  p_slot_id UUID,
  p_dow TEXT,        -- 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
  p_text TEXT        -- NULL 또는 빈문자열이면 해당 요일 키 제거
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
  v_clean TEXT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  IF p_dow NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_dow는 mon~sun 중 하나');
  END IF;

  SELECT md_id INTO v_owner FROM weekly_hotdeal_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '슬롯을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 슬롯만 수정할 수 있어요');
  END IF;

  v_clean := NULLIF(TRIM(COALESCE(p_text, '')), '');
  IF v_clean IS NULL THEN
    -- 키 제거
    UPDATE weekly_hotdeal_slots
      SET benefits_by_dow = benefits_by_dow - p_dow
      WHERE id = p_slot_id;
  ELSE
    UPDATE weekly_hotdeal_slots
      SET benefits_by_dow = benefits_by_dow || jsonb_build_object(p_dow, v_clean)
      WHERE id = p_slot_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_hotdeal_benefit(UUID, TEXT, TEXT) IS
  '요일별 혜택 단건 갱신 (NULL/빈문자열이면 해당 요일 키 제거)';

-- 5) release_hotdeal_slot: 그대로 (시그니처 동일)
-- (Migration 234에서 정의된 함수 그대로 사용)

-- 6) 헬퍼: dow 인덱스 → 키
CREATE OR REPLACE FUNCTION dow_key_kst(p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow INT := EXTRACT(DOW FROM p_date)::INT;  -- 0=일~6=토
BEGIN
  RETURN CASE v_dow
    WHEN 0 THEN 'sun'
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
  END;
END;
$$;

COMMENT ON FUNCTION dow_key_kst(DATE) IS
  '날짜 → benefits_by_dow 키 (sun/mon/tue/wed/thu/fri/sat)';
