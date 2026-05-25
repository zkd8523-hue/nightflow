-- ============================================================================
-- Migration 239: daily_hotdeals.original_price 추가 (정가)
-- 날짜: 2026-05-26
-- 설명:
--   기존 price = 특가 (필수)
--   새 original_price = 정가 (선택). 입력 시 카드에 취소선 + 할인율 배지.
-- ============================================================================

ALTER TABLE daily_hotdeals
  ADD COLUMN IF NOT EXISTS original_price INTEGER;

COMMENT ON COLUMN daily_hotdeals.original_price IS '정가 (선택). 입력 시 카드에 취소선 + 할인율 노출';
COMMENT ON COLUMN daily_hotdeals.price IS '특가 (필수)';

-- ============================================================================
-- create_daily_hotdeal RPC 재정의 — original_price 인자 추가
-- ============================================================================
CREATE OR REPLACE FUNCTION create_daily_hotdeal(
  p_club_id UUID,
  p_title TEXT,
  p_ends_at TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL,
  p_original_price INTEGER DEFAULT NULL
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

  INSERT INTO daily_hotdeals (
    club_id, md_id, title, description, thumbnail_url, price, original_price,
    walk_minutes, nearest_station, ends_at
  )
  VALUES (
    p_club_id, v_md_id, trim(p_title),
    NULLIF(TRIM(p_description), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_price, p_original_price,
    p_walk_minutes,
    NULLIF(TRIM(p_nearest_station), ''),
    p_ends_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- update_daily_hotdeal에도 original_price 추가
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
  p_original_price INTEGER DEFAULT NULL
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
      original_price = COALESCE(p_original_price, original_price),
      walk_minutes = COALESCE(p_walk_minutes, walk_minutes),
      nearest_station = CASE WHEN p_nearest_station IS NULL THEN nearest_station ELSE NULLIF(TRIM(p_nearest_station), '') END,
      ends_at = COALESCE(p_ends_at, ends_at),
      status = COALESCE(p_status, status)
    WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
