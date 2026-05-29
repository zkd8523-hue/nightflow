-- ============================================================================
-- Migration 261: daily_hotdeals.table_zone
--   자리 등급(BAR / BAR통로 / 준메인 / 메인 / 초메인)을 별도 컬럼으로 보관.
--   기존 table_info(자유 텍스트 "A3" 등)와 table_features(구성 칩)와는 별개.
--
--   값: 'bar' | 'bar_aisle' | 'sub_main' | 'main' | 'prime'
--   라벨 매핑은 프론트에서 처리.
-- ============================================================================

ALTER TABLE daily_hotdeals
  ADD COLUMN IF NOT EXISTS table_zone TEXT
  CHECK (table_zone IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime'));

CREATE INDEX IF NOT EXISTS idx_daily_hotdeals_zone
  ON daily_hotdeals(table_zone) WHERE table_zone IS NOT NULL;

-- create_daily_hotdeal: p_table_zone 추가
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
  IF p_table_zone IS NOT NULL
     AND p_table_zone NOT IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime') THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급 값이 올바르지 않아요');
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
    NULLIF(TRIM(p_table_zone), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- update_daily_hotdeal: p_table_zone 추가
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

  IF p_table_zone IS NOT NULL
     AND p_table_zone NOT IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime') THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급 값이 올바르지 않아요');
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
      table_zone     = CASE WHEN p_table_zone IS NULL THEN table_zone ELSE NULLIF(TRIM(p_table_zone), '') END
    WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
