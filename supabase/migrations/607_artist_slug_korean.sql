-- ============================================================================
-- Migration 607: 아티스트 슬러그 — 한글 이름을 해시로 버리지 않는다
-- 날짜: 2026-08-30
-- 배경:
--   568의 ensure_artist()는 slug를 `[^a-z0-9]+`로만 걸러 만든다. 한글 이름은
--   전부 걸러져 빈 문자열이 되고 `artist-<md5 8자리>`로 대체된다.
--
--   실측: artists 1,129명 중 309명(27%)이 이 해시 slug다. 그런데 하필
--   출연 빈도가 높은 한글 이름이 여기 몰려 있다 — 키드밀리, 다이나믹 듀오,
--   팔로알토, 마브, 팔로알토 등. "키드밀리 공연"으로 검색해도 URL에 그
--   이름이 없어 걸릴 여지가 없다.
--
--   ⚠️ 한글↔영문 자동 매칭은 하지 않는다(568 주석과 동일 원칙) — 이미
--      artist_aliases에 두 표기가 함께 걸려 있는 경우에만 영문 별칭을 쓴다.
-- ============================================================================

-- ============================================================================
-- 1) 슬러그 생성 — 한글(가-힣)을 허용 문자에 포함한다.
--    영문 별칭이 있으면 그걸로(검색어와 URL이 일치), 없으면 원래 이름 그대로.
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_artist_slug(p_display_name TEXT, p_english_alias TEXT DEFAULT NULL)
RETURNS TEXT AS $$
  SELECT NULLIF(
    trim(both '-' from
      regexp_replace(lower(COALESCE(p_english_alias, p_display_name)), '[^a-z0-9가-힣]+', '-', 'g')
    ),
    ''
  );
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION generate_artist_slug(TEXT, TEXT) IS
  '아티스트 slug 생성. 한글을 해시로 대체하지 않는다. 영문 별칭이 있으면 그걸 우선한다.';

-- ============================================================================
-- 2) 유니크 slug — 충돌 시 -2, -3 ... 붙인다
-- ============================================================================
CREATE OR REPLACE FUNCTION unique_artist_slug(p_base TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  v_base TEXT := COALESCE(p_base, 'artist');
  v_slug TEXT := v_base;
  v_n    INT := 2;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM artists WHERE slug = v_slug AND (p_exclude_id IS NULL OR id <> p_exclude_id)
  ) LOOP
    v_slug := v_base || '-' || v_n;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3) ensure_artist() 재정의 — 앞으로 생성되는 아티스트부터 이 규칙을 쓴다.
--    (동작은 그대로, slug 생성 부분만 교체)
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_artist(p_raw_name TEXT, p_normalized TEXT)
RETURNS UUID AS $$
DECLARE
  v_artist_id UUID;
  v_slug      TEXT;
BEGIN
  IF p_normalized IS NULL OR p_normalized = '' THEN
    RETURN NULL;
  END IF;

  SELECT artist_id INTO v_artist_id FROM artist_aliases WHERE normalized = p_normalized LIMIT 1;
  IF v_artist_id IS NOT NULL THEN
    RETURN v_artist_id;
  END IF;

  v_slug := COALESCE(generate_artist_slug(p_raw_name), 'artist-' || substr(md5(p_normalized), 1, 8));
  v_slug := unique_artist_slug(v_slug);

  INSERT INTO artists (display_name, slug)
  VALUES (p_raw_name, v_slug)
  RETURNING id INTO v_artist_id;

  INSERT INTO artist_aliases (artist_id, alias, normalized)
  VALUES (v_artist_id, p_raw_name, p_normalized)
  ON CONFLICT (normalized) DO NOTHING;

  RETURN v_artist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4) 일회성 백필 — 기존 해시 slug 309명을 재생성한다.
--    이미 링크된 영문 별칭이 있으면 그걸 쓰고, 없으면 한글 이름 그대로.
-- ============================================================================
DO $$
DECLARE
  v_artist  RECORD;
  v_english TEXT;
  v_new     TEXT;
BEGIN
  FOR v_artist IN
    SELECT id, display_name FROM artists
    WHERE slug ~ '^artist-[0-9a-f]{8}(-[0-9a-f]{4})?$'
  LOOP
    SELECT alias INTO v_english
    FROM artist_aliases
    WHERE artist_id = v_artist.id
      AND alias ~ '^[A-Za-z0-9][A-Za-z0-9 .''-]*$'
    ORDER BY length(alias)
    LIMIT 1;

    v_new := COALESCE(generate_artist_slug(v_artist.display_name, v_english), 'artist-' || substr(md5(v_artist.id::text), 1, 8));
    v_new := unique_artist_slug(v_new, v_artist.id);

    UPDATE artists SET slug = v_new WHERE id = v_artist.id;
  END LOOP;
END $$;
