-- ============================================================================
-- Migration 606: 클럽 추가·별칭 변경 시 미연결 club_events 재연결 + 중복 병합
-- 날짜: 2026-08-30
-- 배경:
--   572의 dedup 키는 club_id 가 있으면 UUID, 없으면 정규화한 이름이다.
--   그래서 "같은 공연인데 한쪽 게시물만 클럽에 연결된" 상태에서 클럽을 새로
--   추가하면, 두 행이 서로 다른 키를 갖게 되어 UNIQUE 인덱스를 그냥 통과한다.
--
--   실측 사례(2026-08-29): Sevens(대전) 클럽을 추가하는 순간
--     · 8/27 수집: raw="세븐즈"  (club_id NULL)
--     · 8/28 수집: raw="Sevens" (club_id 있음)
--   같은 인스타 게시물인데 두 행으로 남았다. 클럽을 추가할 때마다 재발한다.
--
--   ⚠️ club_id를 먼저 채우고 나중에 병합하는 순서로 짜면 안 된다 — 같은 날짜에
--      이미 그 club_id로 연결된 행이 있을 때, UPDATE로 두 번째 행의 club_id를
--      채우는 순간 uniq_club_events_date_venue(572)를 즉시 위반한다(plain UNIQUE
--      INDEX는 constraint가 아니라 DEFERRABLE로 미룰 수 없다).
--      그래서 행 단위로 "이미 연결된 행이 있으면 병합, 없으면 연결"을 골라 처리한다.
-- ============================================================================

-- ============================================================================
-- 1) 이름 정규화 — 572의 규칙을 함수로 분리해 재사용한다
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_club_name_text(p_name TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(upper(COALESCE(p_name, '')), '클럽|CLUB', '', 'g'),
      '[^가-힣A-Z0-9]', '', 'g'
    ),
    ''
  );
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION normalize_club_name_text(TEXT) IS
  '클럽명 매칭용 정규화. club_events_venue_key(572)와 클럽 재연결(606)이 공유한다.';

-- club_events_venue_key가 위 함수를 쓰도록 재정의(동작은 그대로, 중복 로직 제거)
CREATE OR REPLACE FUNCTION club_events_venue_key(p_club_id UUID, p_name TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(p_club_id::TEXT, normalize_club_name_text(p_name), '(unknown)');
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================================
-- 2) 재연결 + 병합 — 클럽 하나에 대해 미연결 club_events를 훑는 핵심 로직
--    트리거와 아래 일회성 백필이 이 함수 하나를 같이 쓴다.
-- ============================================================================
CREATE OR REPLACE FUNCTION reconnect_events_for_club(p_club_id UUID, p_keys TEXT[])
RETURNS VOID AS $$
DECLARE
  v_row      RECORD;
  v_existing UUID;
BEGIN
  IF p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, event_date
    FROM club_events
    WHERE club_id IS NULL
      AND venue_id IS NULL
      AND event_date IS NOT NULL
      AND normalize_club_name_text(club_name_raw) = ANY(p_keys)
  LOOP
    -- 같은 날짜에 이미 이 클럽으로 연결된 행이 있으면 그쪽이 keeper.
    SELECT id INTO v_existing
    FROM club_events
    WHERE club_id = p_club_id AND event_date = v_row.event_date
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      -- 출연진 합집합 이관 (event_id, artist_id) UNIQUE라 겹치는 건 버려진다.
      UPDATE club_event_performers SET event_id = v_existing
      WHERE event_id = v_row.id
        AND artist_id NOT IN (
          SELECT artist_id FROM club_event_performers WHERE event_id = v_existing
        );
      DELETE FROM club_event_performers WHERE event_id = v_row.id;

      UPDATE club_events k SET
        venue_area = COALESCE(k.venue_area, d.venue_area),
        title      = COALESCE(k.title, d.title),
        source_url = COALESCE(k.source_url, d.source_url)
      FROM club_events d
      WHERE k.id = v_existing AND d.id = v_row.id;

      DELETE FROM club_events WHERE id = v_row.id;
    ELSE
      UPDATE club_events SET club_id = p_club_id WHERE id = v_row.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reconnect_events_for_club(UUID, TEXT[]) IS
  '클럽 하나에 매칭되는 미연결 club_events를 연결하거나(중복이면) 병합한다. 트리거·백필 공용.';

-- ============================================================================
-- 3) 트리거 — 클럽 추가·이름/별칭 변경 시 자동 실행
-- ============================================================================
CREATE OR REPLACE FUNCTION reconnect_club_events_on_club_change()
RETURNS TRIGGER AS $$
DECLARE
  v_keys TEXT[];
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_keys := ARRAY(
    SELECT DISTINCT normalize_club_name_text(x)
    FROM unnest(array_append(NEW.aliases, NEW.name)) AS x
    WHERE normalize_club_name_text(x) IS NOT NULL
  );

  PERFORM reconnect_events_for_club(NEW.id, v_keys);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconnect_club_events ON clubs;
CREATE TRIGGER trg_reconnect_club_events
  AFTER INSERT OR UPDATE OF name, aliases ON clubs
  FOR EACH ROW EXECUTE FUNCTION reconnect_club_events_on_club_change();

COMMENT ON TRIGGER trg_reconnect_club_events ON clubs IS
  '클럽 추가·이름/별칭 변경 시 미연결 club_events를 재연결·병합한다(Migration 606).';

-- ============================================================================
-- 4) 일회성 백필 — 이 트리거가 없던 동안 생긴 기존 분열 케이스를 정리한다
--    (세븐즈는 수동으로 이미 정리했지만, 발견되지 않은 같은 유형이 더 있을 수 있다)
-- ============================================================================
DO $$
DECLARE
  v_club RECORD;
  v_keys TEXT[];
BEGIN
  FOR v_club IN SELECT id, name, aliases FROM clubs WHERE deleted_at IS NULL
  LOOP
    v_keys := ARRAY(
      SELECT DISTINCT normalize_club_name_text(x)
      FROM unnest(array_append(v_club.aliases, v_club.name)) AS x
      WHERE normalize_club_name_text(x) IS NOT NULL
    );
    PERFORM reconnect_events_for_club(v_club.id, v_keys);
  END LOOP;
END $$;
