-- ============================================================================
-- Migration 572: club_events 중복 방지 — 같은 날짜·같은 장소 = 한 공연
-- 날짜: 2026-08-26
-- 배경:
--   563의 UNIQUE는 (source_post_id, club_name_raw, event_date)라 "게시물이 다르면
--   다른 공연"으로 취급한다. 그런데 하나의 공연을 주최·클럽·출연DJ가 각자 자기
--   계정에 올리기 때문에 같은 공연이 2~3건씩 들어온다.
--
--   실측(2026-08-26): 예정 공연 43건 중 5건이 중복.
--     9/1 케이크샵 "태양의 적: 첫번째 밤"
--       · @kcapalestine  → 출연 2명
--       · @cakeshopseoul → 출연 9명 (영문 제목 "Enemy of the Sun...")
--       · @hotpot_dj     → 출연 7명
--   계정마다 라인업 상세도가 달라서 아무거나 하나만 남기면 정보를 잃는다.
--
--   그래서 "가장 정보가 많은 행"을 남기고 나머지를 지우되, 출연진은 합집합으로
--   모아 keeper 에 옮긴다(club_event_performers 는 UNIQUE(event_id, artist_id)라
--   그냥 event_id 만 갈아끼우면 중복이 자동으로 정리된다).
--
--   ⚠️ 장소 매칭 기준: club_id 가 있으면 club_id, 없으면 정규화한 club_name_raw.
--      미등록 장소가 절반이라 이름 정규화 없이는 대부분 못 묶는다.
-- ============================================================================

-- ============================================================================
-- 1) 장소 키 — club_id 우선, 없으면 이름 정규화
--    (Edge Function 의 normalizeClubName 과 같은 규약: 대문자화, 클럽/CLUB 제거,
--     영숫자·한글만 남김)
-- ============================================================================
CREATE OR REPLACE FUNCTION club_events_venue_key(p_club_id UUID, p_name TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(
    p_club_id::TEXT,
    NULLIF(
      regexp_replace(
        regexp_replace(upper(COALESCE(p_name, '')), '클럽|CLUB', '', 'g'),
        '[^가-힣A-Z0-9]', '', 'g'
      ),
      ''
    ),
    '(unknown)'
  );
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION club_events_venue_key(UUID, TEXT) IS
  '공연 중복 판정용 장소 키. club_id가 있으면 그것, 없으면 정규화한 원문 클럽명.';

-- ============================================================================
-- 2) 기존 중복 병합
--    keeper = 출연진이 가장 많은 행(같으면 최근 생성). 나머지는 출연진을 keeper로
--    이관 후 삭제한다.
-- ============================================================================
DO $$
DECLARE
  v_group  RECORD;
  v_keeper UUID;
  v_dup    UUID;
BEGIN
  FOR v_group IN
    SELECT
      event_date,
      club_events_venue_key(club_id, club_name_raw) AS vkey,
      array_agg(id ORDER BY
        (SELECT count(*) FROM club_event_performers p WHERE p.event_id = e.id) DESC,
        created_at DESC
      ) AS ids
    FROM club_events e
    WHERE event_date IS NOT NULL
    GROUP BY event_date, club_events_venue_key(club_id, club_name_raw)
    HAVING count(*) > 1
  LOOP
    v_keeper := v_group.ids[1];

    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      -- 출연진 이관. (event_id, artist_id) UNIQUE 라 keeper에 이미 있으면 충돌 →
      -- 그 행은 버린다(합집합이 되는 셈).
      UPDATE club_event_performers SET event_id = v_keeper
      WHERE event_id = v_dup
        AND artist_id NOT IN (
          SELECT artist_id FROM club_event_performers WHERE event_id = v_keeper
        );
      DELETE FROM club_event_performers WHERE event_id = v_dup;

      -- keeper 가 비워둔 필드를 dup 값으로 메운다(장소·지역·클럽 연결·포스터 출처)
      UPDATE club_events k SET
        club_id     = COALESCE(k.club_id, d.club_id),
        venue_area  = COALESCE(k.venue_area, d.venue_area),
        venue_type  = COALESCE(k.venue_type, d.venue_type),
        title       = COALESCE(k.title, d.title),
        source_url  = COALESCE(k.source_url, d.source_url)
      FROM club_events d
      WHERE k.id = v_keeper AND d.id = v_dup;

      DELETE FROM club_events WHERE id = v_dup;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 3) 앞으로의 중복 차단
--    기존 UNIQUE(source_post_id, club_name_raw, event_date)는 남긴다 —
--    같은 게시물 재수집 시의 멱등성은 그쪽이 담당한다.
--    여기서는 "날짜 + 장소" 조합에 부분 UNIQUE 인덱스를 걸어 다른 계정이 올린
--    같은 공연이 새 행으로 들어오는 것을 막는다.
--    (event_date가 NULL인 행은 날짜 미상이라 중복 판정 불가 → 제외)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_club_events_date_venue
  ON club_events (event_date, club_events_venue_key(club_id, club_name_raw))
  WHERE event_date IS NOT NULL;
