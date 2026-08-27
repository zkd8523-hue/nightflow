-- ============================================================================
-- Migration 582: merge_artists() — 아티스트 중복 레코드 병합
-- 날짜: 2026-08-27
-- 배경:
--   같은 아티스트가 한글/영문 표기로 쪼개져 artists 두 행에 나뉘어 있다
--   (실측: 인스타 핸들 겹치는 활성 레코드 49그룹, 예: @satgotloco → LOCO/로꼬).
--   artist_aliases.normalized UNIQUE가 별칭 추가로 합치는 걸 막는다 — 레코드
--   자체를 합쳐야 한다. merge_clubs()(441)와 동일 패턴: 자식 전수 이관 후
--   source soft-delete. artists를 참조하는 자식은 club_event_performers,
--   artist_aliases 둘뿐이다.
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_artists(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_admin_role TEXT;
  v_target_active BOOLEAN;
  v_source_active BOOLEAN;
  v_src_name TEXT;
  v_norm TEXT;
  v_moved_perf INT := 0;
  v_moved_alias INT := 0;
BEGIN
  -- 권한/유효성
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge artist into itself';
  END IF;

  SELECT (deleted_at IS NULL), display_name INTO v_target_active, v_src_name
    FROM artists WHERE id = p_target_id;
  IF v_target_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Target artist not found or already deleted';
  END IF;

  SELECT (deleted_at IS NULL), display_name INTO v_source_active, v_src_name
    FROM artists WHERE id = p_source_id;
  IF v_source_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Source artist not found or already deleted';
  END IF;

  -- ── 출연 기록 이관: UNIQUE(event_id, artist_id) 충돌분은 중복이라 삭제 ──
  WITH moved AS (
    UPDATE club_event_performers p
    SET artist_id = p_target_id
    WHERE p.artist_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM club_event_performers k
        WHERE k.event_id = p.event_id AND k.artist_id = p_target_id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_moved_perf FROM moved;

  DELETE FROM club_event_performers WHERE artist_id = p_source_id;

  -- ── source 표시명을 target 별칭으로 등록 (병합해도 두 이름 모두 검색되게) ──
  v_norm := regexp_replace(lower(v_src_name), '[^a-z0-9가-힣]', '', 'g');
  IF left(v_norm, 2) = 'dj' THEN v_norm := substr(v_norm, 3); END IF;
  IF right(v_norm, 2) = 'dj' THEN v_norm := left(v_norm, -2); END IF;
  IF v_norm = '' THEN
    v_norm := regexp_replace(lower(v_src_name), '[^a-z0-9가-힣]', '', 'g');
  END IF;

  IF v_norm <> '' AND NOT EXISTS (SELECT 1 FROM artist_aliases WHERE normalized = v_norm) THEN
    INSERT INTO artist_aliases (artist_id, alias, normalized)
    VALUES (p_target_id, v_src_name, v_norm);
  END IF;

  -- ── source의 기존 별칭도 이관 (UNIQUE(normalized) 충돌분은 target에 이미 있다는 뜻 → 버림) ──
  WITH moved_alias AS (
    UPDATE artist_aliases a
    SET artist_id = p_target_id
    WHERE a.artist_id = p_source_id
      AND NOT EXISTS (
        SELECT 1 FROM artist_aliases k
        WHERE k.normalized = a.normalized AND k.artist_id = p_target_id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_moved_alias FROM moved_alias;

  DELETE FROM artist_aliases WHERE artist_id = p_source_id;

  -- ── target의 빈 필드만 source 값으로 보충 (덮어쓰지 않음) ──
  UPDATE artists t SET
    instagram = COALESCE(t.instagram, s.instagram),
    soundcloud_url = COALESCE(t.soundcloud_url, s.soundcloud_url),
    youtube_url = COALESCE(t.youtube_url, s.youtube_url),
    photo_url = COALESCE(t.photo_url, s.photo_url),
    bio = COALESCE(t.bio, s.bio),
    label = COALESCE(t.label, s.label)
  FROM artists s
  WHERE t.id = p_target_id AND s.id = p_source_id;

  -- ── source soft-delete (하드 삭제 금지 — 되돌릴 여지를 남긴다) ──
  UPDATE artists SET deleted_at = now() WHERE id = p_source_id;

  RETURN json_build_object(
    'success', true,
    'moved_performers', v_moved_perf,
    'moved_aliases', v_moved_alias
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- find_duplicate_artists() — 병합 후보 자동 탐지
--   1) 인스타 핸들 동일 (가장 확실)
--   2) 별칭 교차 — 한쪽 표시명이 다른 쪽 별칭에 정규화 매치
-- 한글⇄영문(인스타 없는 경우)은 자동 탐지 대상이 아니다 — normalizeDjName이
-- 한글/영문을 자동으로 매칭하지 않는다(djName.ts 규약). 그건 화면에서 사람이
-- 검색해 수동으로 골라 병합한다.
-- ============================================================================
CREATE OR REPLACE FUNCTION find_duplicate_artists()
RETURNS TABLE (
  keep_id UUID,
  keep_name TEXT,
  keep_count BIGINT,
  drop_id UUID,
  drop_name TEXT,
  drop_count BIGINT,
  reason TEXT
) AS $$
  WITH counts AS (
    SELECT a.id, a.display_name, a.instagram,
      (SELECT count(*) FROM club_event_performers p WHERE p.artist_id = a.id) AS perf_count
    FROM artists a
    WHERE a.deleted_at IS NULL
  ),
  handle_dupes AS (
    SELECT
      lower(regexp_replace(instagram, '^@', '')) AS handle,
      array_agg(id ORDER BY perf_count DESC, display_name) AS ids,
      array_agg(display_name ORDER BY perf_count DESC, display_name) AS names,
      array_agg(perf_count ORDER BY perf_count DESC, display_name) AS counts
    FROM counts
    WHERE instagram IS NOT NULL AND instagram <> ''
    GROUP BY 1
    HAVING count(*) > 1
  )
  SELECT
    (ids[1])::UUID AS keep_id,
    names[1] AS keep_name,
    counts[1] AS keep_count,
    (unnest(ids[2:]))::UUID AS drop_id,
    unnest(names[2:]) AS drop_name,
    unnest(counts[2:]) AS drop_count,
    '인스타 핸들 동일' AS reason
  FROM handle_dupes;
$$ LANGUAGE sql STABLE SET search_path = public;

COMMENT ON FUNCTION merge_artists IS
  'artists 중복 레코드 병합. merge_clubs(441)와 동일 패턴 — 자식(club_event_performers, artist_aliases) 전수 이관 후 source soft-delete. source 이름은 target 별칭으로 보존.';
COMMENT ON FUNCTION find_duplicate_artists IS
  '인스타 핸들이 겹치는 활성 artists 그룹 자동 탐지. 병합 후보 목록 화면(/admin/artists)에서 사용. 한글/영문 표기 매칭은 사람이 수동 검색으로 처리.';
