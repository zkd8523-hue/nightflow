-- ============================================================================
-- Migration 573: 시간 없는 라인업 허용 (lineup_sets.start_min NULL)
--
-- 배경:
--   558 은 포스터 타임테이블("22:00 DJ A / 23:00 DJ B")을 전제로 설계돼
--   start_min/end_min 이 NOT NULL 이고, ORDER BY start_min 이 곧 재생 순서였다.
--
--   그런데 클럽이 라인업을 **캡션에 텍스트로만** 적는 경우가 많다:
--       LINE UP
--       YVES (LIVE) @yvesntual
--       LIGRYE @ligrye
--       DJ POOL @pool_up__
--   이건 순서만 있고 시간이 없다. 특히 게시물이 동영상(Reel)이면 포스터 Vision
--   경로가 통째로 막혀서 캡션이 유일한 수집 경로가 된다.
--   (실측: lionseoul SOUNDCLASH 게시물 DJ 9명이 라인업 탭에 아예 없었다.)
--
--   없는 시간을 지어내면(영업시간 균등분할 등) 추정값이 실제 타임테이블처럼
--   보이므로, 시간을 비워두고 순서만 보존하는 쪽을 택한다.
--
-- 변경:
--   1. start_min / end_min → NULL 허용
--   2. sort_order 재계산 — 558 부터 컬럼은 있었지만 값이 전부 DEFAULT 0 이라
--      정렬 키로 못 썼다(항상 start_min 으로 정렬했다). 실제 순서로 채운다.
--   3. UNIQUE(lineup_id, start_min) → UNIQUE(lineup_id, sort_order)
--      (start_min 이 NULL 이면 UNIQUE 가 중복을 못 막는다. Postgres 에서 NULL 은
--       서로 다른 값으로 취급되므로 NULL 셋이 무한히 들어갈 수 있다.)
--   4. upsert_club_lineup() 이 start_min/end_min NULL 을 그대로 넣도록 재정의
--      (sort_order 채우기는 569 에 이미 있다)
--
-- 하위 호환: 기존 행은 sort_order 를 start_min 순서로 backfill 하므로
--   ORDER BY sort_order 가 기존 ORDER BY start_min 과 같은 결과를 낸다.
-- ============================================================================

-- 1) 시간 컬럼 NULL 허용 --------------------------------------------------
ALTER TABLE lineup_sets ALTER COLUMN start_min DROP NOT NULL;
ALTER TABLE lineup_sets ALTER COLUMN end_min   DROP NOT NULL;

-- end_min > start_min 은 둘 다 있을 때만 따진다
ALTER TABLE lineup_sets DROP CONSTRAINT IF EXISTS lineup_sets_check;
DO $$
DECLARE
  v_name TEXT;
BEGIN
  -- 558 에서 이름 없이 선언된 CHECK (end_min > start_min) 를 찾아 제거
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'lineup_sets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%end_min%>%start_min%'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE lineup_sets DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

-- 재실행 대비 — 위 DO 블록이 이 제약까지 지우긴 하지만 명시적으로 한 번 더
ALTER TABLE lineup_sets DROP CONSTRAINT IF EXISTS lineup_sets_time_order_chk;
ALTER TABLE lineup_sets ADD CONSTRAINT lineup_sets_time_order_chk
  CHECK (start_min IS NULL OR end_min IS NULL OR end_min > start_min);

-- 2) sort_order 재계산 -----------------------------------------------------
--    컬럼 자체는 558 부터 있다(NOT NULL DEFAULT 0). 다만 559/567/569 의 함수가
--    삽입 순서대로 채워온 값이라, 라인업 전체를 훑으면 0 이 여럿인 행이 남아 있다.
--    UNIQUE 를 걸려면 라인업 내에서 실제 순서로 다시 매겨야 한다.
--
-- ⚠️ WHERE sort_order IS NULL 같은 조건으로 거르지 말 것 — 컬럼이 NOT NULL 이라
--    한 행도 안 걸리고 전 행이 0 으로 남는다 → UNIQUE 생성 시 23505.
--    (실측: "Key (lineup_id, sort_order)=(..., 0) is duplicated")
--    조건 없이 매번 전 행을 다시 매기는 게 멱등하고 안전하다.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
           PARTITION BY lineup_id
           -- 시간 없는 셋(NULL)은 뒤로. 같은 시각이면 id 로 결정적 순서를 보장한다
           ORDER BY start_min NULLS LAST, id
         ) - 1 AS rn
  FROM lineup_sets
)
UPDATE lineup_sets s SET sort_order = o.rn
FROM ordered o WHERE o.id = s.id;

ALTER TABLE lineup_sets ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE lineup_sets ALTER COLUMN sort_order SET DEFAULT 0;

-- 3) UNIQUE 교체 -----------------------------------------------------------
--    start_min 이 NULL 이면 UNIQUE(lineup_id, start_min) 는 중복을 못 막는다.
ALTER TABLE lineup_sets DROP CONSTRAINT IF EXISTS lineup_sets_lineup_id_start_min_key;
ALTER TABLE lineup_sets DROP CONSTRAINT IF EXISTS lineup_sets_lineup_id_sort_order_key;
ALTER TABLE lineup_sets ADD CONSTRAINT lineup_sets_lineup_id_sort_order_key
  UNIQUE (lineup_id, sort_order);

DROP INDEX IF EXISTS idx_lineup_sets_lineup;
CREATE INDEX IF NOT EXISTS idx_lineup_sets_lineup ON lineup_sets(lineup_id, sort_order);

COMMENT ON COLUMN lineup_sets.start_min IS
  '영업일 06:00 기준 경과 분. 22:00=960, 00:00=1080, 07:00=1500. TIME 타입 금지 — 정렬이 깨짐. 캡션 라인업처럼 시간이 없으면 NULL.';
COMMENT ON COLUMN lineup_sets.sort_order IS
  '라인업 내 표시 순서(0-based). 시간이 없는 캡션 라인업의 정렬 키. 시간이 있으면 start_min 오름차순과 일치한다.';

-- 4) upsert_club_lineup() 시간 NULL 허용 -----------------------------------
--    569 원문과 유일한 차이: (v_set->>'start_min')::INTEGER 를 NULLIF 로 감싼다.
--    캡션 라인업은 start_min 을 JSON 에 null 로 보내는데, ->> 는 그걸 SQL NULL 로
--    돌려주므로 캐스팅은 통과하지만, 빈 문자열("")이 오는 경우까지 함께 막는다.
--
--    ⚠️ 반환 타입은 반드시 JSON 이어야 한다(569 원문과 동일). UUID 등으로 바꾸면
--       CREATE OR REPLACE 가 42P13 "cannot change return type" 으로 실패한다.
CREATE OR REPLACE FUNCTION upsert_club_lineup(
  p_club_id       UUID,
  p_event_date    DATE,
  p_door_open_min INTEGER,
  p_event_title   TEXT,
  p_poster_url    TEXT,
  p_sets          JSONB,
  p_source        TEXT DEFAULT 'admin_manual',
  p_draft_id      UUID DEFAULT NULL
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

  INSERT INTO club_lineups (club_id, event_date, door_open_min, event_title, poster_url, source, created_by, draft_id)
  VALUES (p_club_id, p_event_date, p_door_open_min, p_event_title, p_poster_url, p_source, auth.uid(), p_draft_id)
  ON CONFLICT (club_id, event_date) DO UPDATE SET
    door_open_min = EXCLUDED.door_open_min,
    event_title   = EXCLUDED.event_title,
    poster_url    = COALESCE(EXCLUDED.poster_url, club_lineups.poster_url),
    source        = EXCLUDED.source,
    draft_id      = EXCLUDED.draft_id,
    updated_at    = now()
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
  '라인업 저장의 유일한 경로. 수동/자동 공용. replace-all 방식. start_min/end_min 이 NULL 이면 시간 미표기 라인업(캡션 수집분)으로 sort_order 순서만 쓴다 (Migration 573).';
