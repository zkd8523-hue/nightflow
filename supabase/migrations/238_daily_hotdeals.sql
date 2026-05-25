-- ============================================================================
-- Migration 238: daily_hotdeals 테이블 (당일 특가/핫딜)
-- 날짜: 2026-05-26
-- 설명:
--   MD가 등록하는 단발성 핫딜 카드. weekly_hotdeal_slots와는 별도 시스템.
--
--   weekly_hotdeal_slots = 주 단위 광고 슬롯 (게스트 간판 의미로 전환 예정)
--   daily_hotdeals      = 종료시간 있는 단발성 핫딜 카드 (여기어때 오픈런특가 패턴)
--
--   광고 모델 (거래 X, MD 인스타로 직접 연락)
--
--   주요 필드:
--     - title: 카드 제목 (예: "토요일 VVIP 테이블 30% 할인")
--     - price: 가격 (정보용, 거래 X)
--     - ends_at: 종료 시각 (카운트다운용)
--     - walk_minutes: 가까운 역에서 도보 분
--     - description: 본문 설명
--     - thumbnail_url: 카드 대표 이미지 (없으면 클럽 썸네일 fallback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_hotdeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  price INTEGER,                            -- 정보용 가격 (NULL 허용)
  walk_minutes INTEGER,                     -- 가까운 역에서 도보 분
  nearest_station TEXT,                     -- 가까운 역 이름 (선택)

  -- 카운트다운 (KST 자정 같은 종료 시각)
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,

  -- 상태
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'expired')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_daily_hotdeals_active
  ON daily_hotdeals(club_id, ends_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_daily_hotdeals_md ON daily_hotdeals(md_id);

COMMENT ON TABLE daily_hotdeals IS
  '당일 특가/핫딜 카드 (MD가 등록, 광고 모델, 종료시간 카운트다운). weekly_hotdeal_slots와 별도.';

-- ============================================================================
-- updated_at 자동
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_daily_hotdeals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_hotdeals_updated_at ON daily_hotdeals;
CREATE TRIGGER daily_hotdeals_updated_at
  BEFORE UPDATE ON daily_hotdeals
  FOR EACH ROW EXECUTE FUNCTION trg_daily_hotdeals_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE daily_hotdeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active hotdeals"
  ON daily_hotdeals
  FOR SELECT
  USING (TRUE);

CREATE POLICY "MD can manage own hotdeals"
  ON daily_hotdeals
  FOR ALL
  USING (auth.uid() = md_id)
  WITH CHECK (auth.uid() = md_id);

-- ============================================================================
-- RPC: create_daily_hotdeal
--   가드: MD 또는 admin + club_partners 연결 확인
--   테스트 클럽(이름에 '운영자')은 파트너 가드 우회
-- ============================================================================
CREATE OR REPLACE FUNCTION create_daily_hotdeal(
  p_club_id UUID,
  p_title TEXT,
  p_ends_at TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_partner_exists BOOLEAN;
  v_id UUID;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  IF NOT v_is_admin AND NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
    END IF;
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '제목을 입력해주세요');
  END IF;
  IF p_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', '종료 시각이 미래여야 해요');
  END IF;

  INSERT INTO daily_hotdeals (
    club_id, md_id, title, description, thumbnail_url, price,
    walk_minutes, nearest_station, ends_at
  )
  VALUES (
    p_club_id, v_md_id, trim(p_title),
    NULLIF(TRIM(p_description), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_price, p_walk_minutes,
    NULLIF(TRIM(p_nearest_station), ''),
    p_ends_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION create_daily_hotdeal(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER, TEXT) IS
  '핫딜 카드 등록 (MD/admin, partner 가드, 테스트 클럽 우회)';

-- ============================================================================
-- RPC: update_daily_hotdeal (본인 핫딜만)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_daily_hotdeal(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT NULL
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

  SELECT md_id INTO v_owner FROM daily_hotdeals WHERE id = p_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '핫딜을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 핫딜만 수정할 수 있어요');
  END IF;

  UPDATE daily_hotdeals
    SET
      title = COALESCE(NULLIF(TRIM(p_title), ''), title),
      description = CASE WHEN p_description IS NULL THEN description ELSE NULLIF(TRIM(p_description), '') END,
      thumbnail_url = CASE WHEN p_thumbnail_url IS NULL THEN thumbnail_url ELSE NULLIF(TRIM(p_thumbnail_url), '') END,
      price = COALESCE(p_price, price),
      walk_minutes = COALESCE(p_walk_minutes, walk_minutes),
      nearest_station = CASE WHEN p_nearest_station IS NULL THEN nearest_station ELSE NULLIF(TRIM(p_nearest_station), '') END,
      ends_at = COALESCE(p_ends_at, ends_at),
      status = COALESCE(p_status, status)
    WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_daily_hotdeal(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TEXT) IS
  '본인 핫딜 갱신';

-- ============================================================================
-- 만료 자동화 (간단 함수, Cron은 별도 작업)
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_old_hotdeals()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE daily_hotdeals
    SET status = 'expired'
    WHERE status = 'active' AND ends_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION expire_old_hotdeals() IS
  'ends_at 지난 active 핫딜을 expired로 전환 (cron에서 호출)';
