-- ============================================================================
-- Migration 626: club_lineups 원본 게시물 링크(source_url / source_account)
-- 날짜: 2026-09-02
-- 선행: 558(club_lineups), 561(lineup_drafts), 625(upsert_club_lineup 10인자)
--
-- 왜 필요한가
--   공연 상세(/events/[date]/[slug])는 club_events.source_url 로 "원본 게시물 보기"
--   를 이미 노출한다. 같은 인스타 게시물에서 나온 DJ 라인업 상세
--   (/clubs/[id]/lineup/[date])에는 그 문이 없어서, 라인업만 보고 들어온 유저는
--   원문(포스터 전체·공지·변경사항)에 닿을 길이 아예 없다. 출처 표기는 저작물
--   재구성(우리는 캡션을 싣지 않고 사실만 재구성한다)의 최소 예의이기도 하다.
--
-- 왜 club_lineups 에 컬럼을 두는가 — draft 조인으로는 안 되기 때문
--   구조상으로는 club_lineups.draft_id → lineup_drafts.ig_permalink 가 정답처럼
--   보이지만, 실측하면 292건 중 draft_id 가 살아있는 건 96건뿐이고 최근 것은
--   전부 NULL 이다. 현재 활성 수집기(collect-club-events)가 한 게시물에서 여러
--   밤을 뽑을 때 draft claim 을 첫 밤에만 쓰고(djDraftClaimUsed) 나머지엔
--   draftId=null 을 넘기기 때문이다 — 월간 스케줄 게시물이 흔해서 이게 다수다.
--   즉 draft 는 "감사 로그"라 1:N 이고, 표시용 출처는 라인업 행이 자기 것으로
--   들고 있어야 한다. club_events 가 이미 같은 이유로 source_url 을 자기 컬럼에
--   둔 선례를 그대로 따른다.
-- ============================================================================

ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS source_account TEXT;

COMMENT ON COLUMN club_lineups.source_url IS
  '이 라인업을 뽑아낸 원본 인스타 게시물 permalink. 라인업 상세에서 "원본 게시물 보기"로 공개 노출한다. 수동 입력(admin_manual)은 대개 NULL. (Migration 626)';
COMMENT ON COLUMN club_lineups.source_account IS
  '원본 게시물을 올린 인스타 계정(@ 없이). 링크 문구에 "(handle)"로 붙는다. club_events.source_account와 동일 규약. (Migration 626)';

-- ============================================================================
-- upsert_club_lineup 재정의 — p_source_url / p_source_account 추가
--
-- ⚠️ 625 주석의 경고 그대로: 인자 개수가 10→12로 바뀌면 CREATE OR REPLACE 가
-- "다른 함수"로 취급해 오버로드가 쌓인다. 옛 10인자 시그니처를 먼저 DROP 한다.
-- 기존 호출부는 전부 named object 호출이고 새 인자에 기본값 NULL 이 있어
-- 그대로 동작한다.
--
-- COALESCE 로 갱신하는 이유: 같은 라인업이 나중에 출처 없는 경로(수동 수정 등)
-- 로 다시 upsert 될 때 이미 확보한 원본 링크를 NULL 로 지우지 않기 위함.
-- ticket_url/entry_fee_text 와 같은 규약.
-- ============================================================================
DROP FUNCTION IF EXISTS upsert_club_lineup(UUID, DATE, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION upsert_club_lineup(
  p_club_id        UUID,
  p_event_date     DATE,
  p_door_open_min  INTEGER,
  p_event_title    TEXT,
  p_poster_url     TEXT,
  p_sets           JSONB,
  p_source         TEXT DEFAULT 'admin_manual',
  p_draft_id       UUID DEFAULT NULL,
  p_ticket_url     TEXT DEFAULT NULL,
  p_entry_fee_text TEXT DEFAULT NULL,
  p_source_url     TEXT DEFAULT NULL,
  p_source_account TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_lineup_id UUID;
  v_set       JSONB;
  v_sort      INTEGER := 0;
BEGIN
  IF NOT can_write_lineups() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;

  IF p_source NOT IN ('admin_manual', 'admin_vision', 'ig_auto', 'ig_review') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  IF p_sets IS NULL OR jsonb_array_length(p_sets) < 1 THEN
    RAISE EXCEPTION '셋이 최소 1개 이상 필요합니다';
  END IF;

  INSERT INTO club_lineups (club_id, event_date, door_open_min, event_title, poster_url, source, created_by, draft_id, ticket_url, entry_fee_text, source_url, source_account)
  VALUES (p_club_id, p_event_date, p_door_open_min, p_event_title, p_poster_url, p_source, auth.uid(), p_draft_id, p_ticket_url, p_entry_fee_text, p_source_url, p_source_account)
  ON CONFLICT (club_id, event_date) DO UPDATE SET
    door_open_min  = EXCLUDED.door_open_min,
    event_title    = EXCLUDED.event_title,
    poster_url     = COALESCE(EXCLUDED.poster_url, club_lineups.poster_url),
    source         = EXCLUDED.source,
    draft_id       = EXCLUDED.draft_id,
    ticket_url     = COALESCE(EXCLUDED.ticket_url, club_lineups.ticket_url),
    entry_fee_text = COALESCE(EXCLUDED.entry_fee_text, club_lineups.entry_fee_text),
    source_url     = COALESCE(EXCLUDED.source_url, club_lineups.source_url),
    source_account = COALESCE(EXCLUDED.source_account, club_lineups.source_account),
    updated_at     = now()
  RETURNING id INTO v_lineup_id;

  -- replace-all: 기존 셋 전부 삭제 후 재삽입
  DELETE FROM lineup_sets WHERE lineup_id = v_lineup_id;

  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    INSERT INTO lineup_sets (lineup_id, dj_id, start_min, end_min, raw_name, sort_order)
    VALUES (
      v_lineup_id,
      (v_set->>'dj_id')::UUID,
      NULLIF(v_set->>'start_min', '')::INTEGER,
      NULLIF(v_set->>'end_min', '')::INTEGER,
      v_set->>'raw_name',
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'lineup_id', v_lineup_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION upsert_club_lineup IS
  '라인업 저장의 유일한 쓰기 경로. 셋은 replace-all. source_url/source_account는 원본 인스타 게시물 출처(Migration 626).';

-- ============================================================================
-- 백필 1) draft_id 링크가 살아있는 건 — 96건. 가장 확실한 경로.
-- ============================================================================
UPDATE club_lineups cl
SET source_url = d.ig_permalink
FROM lineup_drafts d
WHERE cl.draft_id = d.id
  AND d.ig_permalink IS NOT NULL
  AND cl.source_url IS NULL;

-- ============================================================================
-- 백필 2) draft_id 가 끊긴 다수(164건) — (club_id, 게시물이 지목한 영업일)로 잇는다.
--
-- draft.parsed 는 모델 원본 출력이고 event_date 가 "MM-DD"(연도 없음)로만 들어
-- 있다. 연도 복원은 Edge Function 의 resolveLineupDate(_shared/lineup-logic.ts)와
-- **똑같은 규칙**이어야 한다. 다르게 계산하면 엉뚱한 게시물이 라인업에 붙는데,
-- 그건 링크가 없는 것보다 나쁘다(유저를 남의 클럽 공지로 보낸다).
--
-- resolveLineupDate 규칙을 그대로 옮긴 것:
--   1) 연도 = 게시 연도. 단 12월에 올린 1월 → +1년, 1월에 올린 12월 → -1년.
--   2) 그 날짜가 게시일 기준 -3일 ~ +90일 밖이면 월 오독으로 보고,
--      일자(dd)는 유지한 채 월만 게시월 → 다음 달 순으로 되돌려 본다.
--   3) 단 과거로 -3일보다 더 벗어난 건 회고글이므로 보정하지 않고 버린다.
--   4) 어느 후보도 범위에 못 들면 NULL(= 이 draft 는 백필하지 않는다).
--
-- 여기서는 위 후보들(base → 게시월 → 다음 달)을 순서대로 늘어놓고 범위에 드는
-- 첫 번째를 고르는 방식으로 같은 결과를 낸다.
--
-- 시간대 주의: resolveLineupDate 는 전부 UTC 기준(getUTCFullYear/getUTCMonth,
-- ISO 자정 UTC 비교)으로 계산한다. 여기서도 KST 로 바꾸지 않고 UTC 로 맞춘다.
--
-- 한 라인업에 후보가 여럿이면(같은 클럽·같은 밤을 여러 번 올린 경우) 가장 최근
-- 게시물을 택한다 — 변경 공지가 원본을 갱신한 경우 최신이 정본이기 때문.
-- ============================================================================
WITH parsed_events AS (
  SELECT
    d.club_id,
    d.ig_permalink,
    d.ig_media_timestamp,
    -- 계정 핸들: ig_sources → 모델이 읽은 장소 핸들 → 클럽 등록 핸들 순.
    -- 링크 문구의 "(handle)" 괄호에만 쓰이므로 전부 NULL 이어도 링크는 정상 동작한다.
    COALESCE(s.ig_username, ev->>'venue_instagram', c.instagram) AS ig_username,
    SPLIT_PART(ev->>'event_date', '-', 1)::INT AS mm,
    SPLIT_PART(ev->>'event_date', '-', 2)::INT AS dd,
    -- resolveLineupDate 는 UTC 기준으로 연/월을 읽는다
    EXTRACT(YEAR  FROM d.ig_media_timestamp AT TIME ZONE 'UTC')::INT AS post_year,
    EXTRACT(MONTH FROM d.ig_media_timestamp AT TIME ZONE 'UTC')::INT AS post_month,
    (d.ig_media_timestamp AT TIME ZONE 'UTC') AS posted_utc
  FROM lineup_drafts d
  -- ⚠️ 실측(2026-09-02): permalink 있는 draft 477건 전부 source_id 가 NULL 이다
  -- (현재 활성 수집기 collect-club-events 는 ig_sources 를 안 거친다). 그래서
  -- 계정 핸들은 이 조인이 아니라 아래 COALESCE 의 폴백에서 사실상 다 나온다.
  -- 조인은 옛 collect-ig-lineups 경로로 들어온 행을 위해 남겨둔다.
  LEFT JOIN ig_sources s ON s.id = d.source_id
  LEFT JOIN clubs c ON c.id = d.club_id
  CROSS JOIN LATERAL jsonb_array_elements(d.parsed->'events') AS ev
  WHERE d.ig_permalink IS NOT NULL
    AND d.ig_media_timestamp IS NOT NULL
    AND jsonb_typeof(d.parsed->'events') = 'array'
    -- "MM-DD" 형태만 (모델이 다른 포맷을 뱉었으면 건너뛴다)
    AND ev->>'event_date' ~ '^\d{2}-\d{2}$'
    AND SPLIT_PART(ev->>'event_date', '-', 1)::INT BETWEEN 1 AND 12
    AND SPLIT_PART(ev->>'event_date', '-', 2)::INT BETWEEN 1 AND 31
),
based AS (
  SELECT
    pe.*,
    -- 1) 연말연시 보정된 기준 연도
    CASE
      WHEN post_month = 12 AND mm = 1  THEN post_year + 1
      WHEN post_month = 1  AND mm = 12 THEN post_year - 1
      ELSE post_year
    END AS base_year
  FROM parsed_events pe
),
candidates AS (
  -- 후보를 우선순위(cand_rank)와 함께 늘어놓는다. 존재하지 않는 날짜(2월 30일 등)는
  -- make_date 가 에러를 내므로 미리 걸러낸다.
  SELECT b.*, 0 AS cand_rank, make_date(b.base_year, b.mm, b.dd) AS cand
  FROM based b
  WHERE b.dd <= EXTRACT(DAY FROM (make_date(b.base_year, b.mm, 1) + INTERVAL '1 month - 1 day'))
  UNION ALL
  -- 2) 월 오독 보정: 게시월. 단 과거로 벗어난 경우(3)는 아래 WHERE 에서 제외된다.
  SELECT b.*, 1 AS cand_rank, make_date(b.post_year, b.post_month, b.dd)
  FROM based b
  WHERE b.dd <= EXTRACT(DAY FROM (make_date(b.post_year, b.post_month, 1) + INTERVAL '1 month - 1 day'))
  UNION ALL
  -- 2) 월 오독 보정: 다음 달(월말에 올린 다음 달 포스터)
  SELECT b.*, 2 AS cand_rank,
         make_date(
           CASE WHEN b.post_month = 12 THEN b.post_year + 1 ELSE b.post_year END,
           CASE WHEN b.post_month = 12 THEN 1 ELSE b.post_month + 1 END,
           b.dd)
  FROM based b
  WHERE b.dd <= EXTRACT(DAY FROM (
          make_date(
            CASE WHEN b.post_month = 12 THEN b.post_year + 1 ELSE b.post_year END,
            CASE WHEN b.post_month = 12 THEN 1 ELSE b.post_month + 1 END,
            1) + INTERVAL '1 month - 1 day'))
),
scored AS (
  SELECT
    c.*,
    -- daysFromPost: 후보 날짜 자정(UTC) - 게시 시각(UTC), 일 단위 (소수 포함)
    EXTRACT(EPOCH FROM (c.cand::TIMESTAMP - c.posted_utc)) / 86400.0 AS diff_days,
    -- cand_rank 0(기준 연도) 후보가 과거로 -3일 넘게 벗어났는지 = 회고글 판정.
    -- 그러면 이 draft 는 보정 후보(cand_rank 1,2)도 쓰지 않고 통째로 버린다.
    MIN(CASE WHEN c.cand_rank = 0 THEN
      EXTRACT(EPOCH FROM (c.cand::TIMESTAMP - c.posted_utc)) / 86400.0 END)
      OVER (PARTITION BY c.ig_permalink, c.mm, c.dd) AS base_diff_days
  FROM candidates c
),
valid AS (
  SELECT * FROM scored
  WHERE diff_days >= -3 AND diff_days <= 90
    -- 3) 기준 후보가 과거로 벗어난 회고글이면 보정 후보를 쓰지 않는다
    AND NOT (cand_rank > 0 AND base_diff_days < -3)
),
picked AS (
  -- draft × MM-DD 하나당 우선순위가 가장 높은 후보 하나만 남기고,
  SELECT DISTINCT ON (ig_permalink, mm, dd)
    club_id, cand AS event_date, ig_permalink, ig_username, ig_media_timestamp
  FROM valid
  ORDER BY ig_permalink, mm, dd, cand_rank
),
final AS (
  -- 같은 (클럽, 밤)을 여러 게시물이 지목하면 최신 게시물이 정본
  SELECT DISTINCT ON (club_id, event_date)
    club_id, event_date, ig_permalink, ig_username
  FROM picked
  ORDER BY club_id, event_date, ig_media_timestamp DESC
)
UPDATE club_lineups cl
SET source_url     = f.ig_permalink,
    source_account = f.ig_username
FROM final f
WHERE cl.club_id = f.club_id
  AND cl.event_date = f.event_date
  AND cl.source_url IS NULL
  -- 수동 입력 건은 원본 게시물이 있다고 단정할 수 없다(포스터를 DM으로 받은 경우 등).
  -- 자동 수집으로 들어온 것만 백필한다.
  AND cl.source IN ('ig_auto', 'ig_review');

-- ============================================================================
-- 백필 3) source_account 채우기 — 1)에서 URL만 채운 건들.
-- ig_sources 조인으로 계정 핸들을 붙인다. 없으면 NULL(링크만 나가고 "(handle)"
-- 괄호가 안 붙을 뿐이라 표시에 문제없다).
-- ============================================================================
UPDATE club_lineups cl
SET source_account = COALESCE(s.ig_username, c.instagram)
FROM lineup_drafts d
LEFT JOIN ig_sources s ON s.id = d.source_id
LEFT JOIN clubs c ON c.id = d.club_id
WHERE cl.draft_id = d.id
  AND cl.source_url IS NOT NULL
  AND cl.source_account IS NULL
  AND COALESCE(s.ig_username, c.instagram) IS NOT NULL;
