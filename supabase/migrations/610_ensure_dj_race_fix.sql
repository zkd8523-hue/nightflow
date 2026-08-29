-- ensure_dj / ensure_artist 동시 실행 경합으로 같은 사람이 갈라지던 것 수정.
--
-- 증상(2026-08-30 실측): 이름이 완전히 같은데 djs 행이 두 개인 경우가 57건.
--   VALENTINO KHAN (slug=valentinokhan)      별칭 있음
--   VALENTINO KHAN (slug=valentinokhan-5a46) 별칭 ❌ 없음
-- 전부 8/26 16:23~16:28 몇 분 사이에 몰려 생겼고, slug 에 랜덤 접미사가 붙어 있었다.
--
-- 원인: 수집기가 워커 4개를 동시에 돌린다(POST_CONCURRENCY=4). 같은 DJ가 여러
-- 게시물에 나오면 다음 경합이 난다.
--
--   워커 A: aliases 조회(없음) → djs INSERT → aliases INSERT 성공
--   워커 B: aliases 조회(없음, A가 아직 커밋 전) → djs INSERT
--           → aliases INSERT 충돌 → ON CONFLICT DO NOTHING 으로 조용히 통과
--           → B가 만든 djs 행이 별칭 없는 고아로 남는다
--
-- 고아 행은 aliases 에 없으므로 다음 호출에서도 못 찾는다. 즉 한 번 갈라지면
-- 영구히 갈라진 채로 남고, 라인업이 두 사람에게 쪼개져 기록된다.
--
-- 수정: 별칭 INSERT 가 충돌하면 = 다른 워커가 먼저 만들었다는 뜻이다.
-- 그 워커의 dj_id 를 돌려주고, 방금 만든 고아 djs 행은 지운다.

CREATE OR REPLACE FUNCTION ensure_dj(p_raw_name TEXT, p_normalized TEXT)
RETURNS UUID AS $$
DECLARE
  v_dj_id     UUID;
  v_slug      TEXT;
  v_winner_id UUID;
BEGIN
  IF p_normalized IS NULL OR p_normalized = '' THEN
    RETURN NULL;
  END IF;

  SELECT dj_id INTO v_dj_id FROM dj_aliases WHERE normalized = p_normalized LIMIT 1;
  IF v_dj_id IS NOT NULL THEN
    RETURN v_dj_id;
  END IF;

  -- slug: URL 세그먼트라 영숫자+하이픈만 남긴다. 한글 표기(예: "버뮤다")는
  -- 전부 제거되어 빈 문자열이 되므로 그 경우 해시 기반 대체 slug를 쓴다.
  v_slug := regexp_replace(lower(p_normalized), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN
    v_slug := 'dj-' || substr(md5(p_normalized), 1, 8);
  END IF;
  IF EXISTS (SELECT 1 FROM djs WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO djs (display_name, slug)
  VALUES (p_raw_name, v_slug)
  RETURNING id INTO v_dj_id;

  INSERT INTO dj_aliases (dj_id, alias, normalized)
  VALUES (v_dj_id, p_raw_name, p_normalized)
  ON CONFLICT (normalized) DO NOTHING
  RETURNING dj_id INTO v_winner_id;

  -- RETURNING 이 비었다 = 충돌했다 = 다른 워커가 먼저 이 사람을 만들었다.
  -- 방금 만든 내 djs 행은 별칭 없는 고아이므로 지우고, 먼저 만든 쪽을 쓴다.
  IF v_winner_id IS NULL THEN
    SELECT dj_id INTO v_winner_id FROM dj_aliases WHERE normalized = p_normalized LIMIT 1;
    IF v_winner_id IS NOT NULL AND v_winner_id <> v_dj_id THEN
      DELETE FROM djs WHERE id = v_dj_id;
      RETURN v_winner_id;
    END IF;
  END IF;

  RETURN v_dj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION ensure_dj(TEXT, TEXT) IS
  'DJ 표기 → djs 행 조회/생성 후 id 반환. dj_aliases.normalized UNIQUE 로 동일인 분열 방지. '
  '동시 실행 시 별칭 INSERT 충돌을 감지해 먼저 만든 쪽으로 합류한다(Migration 610). '
  '자동 수집(collect-club-events)에서 호출.';

-- ensure_artist 도 같은 경합 버그가 있다(607 버전 기준). 같은 방식으로 고친다.
-- slug 생성은 607 의 generate_artist_slug / unique_artist_slug 를 그대로 쓴다.
CREATE OR REPLACE FUNCTION ensure_artist(p_raw_name TEXT, p_normalized TEXT)
RETURNS UUID AS $$
DECLARE
  v_artist_id UUID;
  v_slug      TEXT;
  v_winner_id UUID;
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
  ON CONFLICT (normalized) DO NOTHING
  RETURNING artist_id INTO v_winner_id;

  IF v_winner_id IS NULL THEN
    SELECT artist_id INTO v_winner_id FROM artist_aliases WHERE normalized = p_normalized LIMIT 1;
    IF v_winner_id IS NOT NULL AND v_winner_id <> v_artist_id THEN
      DELETE FROM artists WHERE id = v_artist_id;
      RETURN v_winner_id;
    END IF;
  END IF;

  RETURN v_artist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
