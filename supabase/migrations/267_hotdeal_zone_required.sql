-- ============================================================================
-- Migration 263: 핫딜 자리 등급(table_zone) 필수화 + 클럽×자리당 1개 제약
--
--   - daily_hotdeals.table_zone NOT NULL (활성 핫딜 기준)
--   - 같은 클럽(club_id)에서 같은 자리 등급(table_zone)의 active 핫딜은 1개만
--   - 부분 유니크 인덱스로 동시성 안전하게 강제
--
--   이미 NULL인 기존 행은 'main'으로 채워넣음(현장 운영 기본값 가정).
--   필요 시 admin이 수동 수정.
-- ============================================================================

-- 1) 기존 NULL 데이터 보정 (활성/비활성 무관 일괄)
UPDATE daily_hotdeals
SET table_zone = 'main'
WHERE table_zone IS NULL;

-- 2) 클럽 × 자리등급당 active 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hotdeals_club_zone_active
  ON daily_hotdeals(club_id, table_zone)
  WHERE status = 'active';

-- 3) create_daily_hotdeal: 자리 등급 필수 검증
CREATE OR REPLACE FUNCTION create_daily_hotdeal(
  p_club_id UUID,
  p_title TEXT,
  p_ends_at TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL,
  p_original_price INTEGER DEFAULT NULL,
  p_table_info TEXT DEFAULT NULL,
  p_table_features TEXT[] DEFAULT '{}',
  p_liquor_includes TEXT[] DEFAULT '{}',
  p_table_zone TEXT DEFAULT NULL
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
  v_zone_clash BOOLEAN;
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
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '특가를 입력해주세요');
  END IF;
  IF p_original_price IS NOT NULL AND p_original_price <= p_price THEN
    RETURN jsonb_build_object('success', false, 'error', '정가는 특가보다 높아야 해요');
  END IF;

  -- 자리 등급 필수
  IF p_table_zone IS NULL OR length(trim(p_table_zone)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급을 선택해주세요');
  END IF;
  IF p_table_zone NOT IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime') THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급 값이 올바르지 않아요');
  END IF;

  -- 같은 클럽 × 같은 자리 active 중복 사전 체크 (친절 에러용)
  SELECT EXISTS(
    SELECT 1 FROM daily_hotdeals
    WHERE club_id = p_club_id AND table_zone = p_table_zone AND status = 'active'
  ) INTO v_zone_clash;
  IF v_zone_clash THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이 자리 등급은 이미 활성 핫딜이 있어요. 기존 핫딜을 종료한 뒤 다시 등록해주세요'
    );
  END IF;

  INSERT INTO daily_hotdeals (
    club_id, md_id, title, description, thumbnail_url, price, original_price,
    walk_minutes, nearest_station, ends_at,
    table_info, table_features, liquor_includes, table_zone
  )
  VALUES (
    p_club_id, v_md_id, trim(p_title),
    NULLIF(TRIM(p_description), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_price, p_original_price,
    p_walk_minutes,
    NULLIF(TRIM(p_nearest_station), ''),
    p_ends_at,
    NULLIF(TRIM(p_table_info), ''),
    COALESCE(p_table_features, '{}'),
    COALESCE(p_liquor_includes, '{}'),
    p_table_zone
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 4) update_daily_hotdeal: 자리 등급 변경 시에도 같은 중복 체크
CREATE OR REPLACE FUNCTION update_daily_hotdeal(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_original_price INTEGER DEFAULT NULL,
  p_table_info TEXT DEFAULT NULL,
  p_table_features TEXT[] DEFAULT NULL,
  p_liquor_includes TEXT[] DEFAULT NULL,
  p_table_zone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
  v_club_id UUID;
  v_zone_clash BOOLEAN;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT md_id, club_id INTO v_owner, v_club_id FROM daily_hotdeals WHERE id = p_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '핫딜을 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 핫딜만 수정할 수 있어요');
  END IF;

  IF p_table_zone IS NOT NULL THEN
    IF length(trim(p_table_zone)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '자리 등급을 선택해주세요');
    END IF;
    IF p_table_zone NOT IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime') THEN
      RETURN jsonb_build_object('success', false, 'error', '자리 등급 값이 올바르지 않아요');
    END IF;
    -- 자기 자신 제외하고 같은 클럽×자리 active 충돌 체크
    SELECT EXISTS(
      SELECT 1 FROM daily_hotdeals
      WHERE club_id = v_club_id
        AND table_zone = p_table_zone
        AND status = 'active'
        AND id <> p_id
    ) INTO v_zone_clash;
    IF v_zone_clash THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '이 자리 등급은 이미 활성 핫딜이 있어요. 기존 핫딜을 종료한 뒤 다시 등록해주세요'
      );
    END IF;
  END IF;

  UPDATE daily_hotdeals
    SET
      title          = COALESCE(NULLIF(TRIM(p_title), ''), title),
      description    = CASE WHEN p_description IS NULL THEN description ELSE NULLIF(TRIM(p_description), '') END,
      thumbnail_url  = CASE WHEN p_thumbnail_url IS NULL THEN thumbnail_url ELSE NULLIF(TRIM(p_thumbnail_url), '') END,
      price          = COALESCE(p_price, price),
      original_price = COALESCE(p_original_price, original_price),
      walk_minutes   = COALESCE(p_walk_minutes, walk_minutes),
      nearest_station= CASE WHEN p_nearest_station IS NULL THEN nearest_station ELSE NULLIF(TRIM(p_nearest_station), '') END,
      ends_at        = COALESCE(p_ends_at, ends_at),
      status         = COALESCE(p_status, status),
      table_info     = CASE WHEN p_table_info IS NULL THEN table_info ELSE NULLIF(TRIM(p_table_info), '') END,
      table_features = COALESCE(p_table_features, table_features),
      liquor_includes= COALESCE(p_liquor_includes, liquor_includes),
      table_zone     = COALESCE(p_table_zone, table_zone)
    WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
