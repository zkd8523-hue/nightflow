-- ============================================================================
-- Migration 586: club_events / club_lineups — ticket_url 컬럼 추가
-- 날짜: 2026-08-27
-- 배경:
--   공연 상세 CTA가 "예매하기"를 안 보여준다 — 붙일 만큼 확실한 링크가 없어서
--   의도적으로 뺐었다(events/[date]/[slug]/page.tsx 주석). 하지만 캡션에
--   인터파크/YES24/RA 등 티켓 링크가 명시된 경우는 실제로 있고, 프롬프트가
--   이미 그 플랫폼 핸들들을 "출연자 아님"으로 구분해왔다(WHAT IS NOT A PERFORMER).
--   그 판별 능력을 링크 추출로 승격시킨다.
--
--   비용: 이미 읽고 있는 캡션에서 필드 하나 더 뽑는 것뿐이라 LLM 호출 추가 없음.
--
--   링크가 없으면 null — CTA는 "클럽 정보 보기"로 그대로 폴백한다.
-- ============================================================================

ALTER TABLE club_events ADD COLUMN IF NOT EXISTS ticket_url TEXT;
ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS ticket_url TEXT;

COMMENT ON COLUMN club_events.ticket_url IS
  '캡션에 명시된 예매/티켓 링크. 모델이 지어내지 않는다는 전제(프롬프트 규칙) + 서버에서 http(s) 형식만 재검증. 인스타 자기링크는 제외.';
COMMENT ON COLUMN club_lineups.ticket_url IS
  '캡션에 명시된 예매/티켓 링크. club_events.ticket_url과 동일 규칙.';

-- ============================================================================
-- upsert_club_lineup 재정의 — p_ticket_url 파라미터 추가
-- 573 원문에서 이 한 줄만 다르다: INSERT/ON CONFLICT에 ticket_url 반영.
-- 기존 호출부(admin API, Edge Function)는 named object로 호출하고 새 인자에
-- 기본값 NULL이 있어 그대로 동작한다.
--
-- ⚠️ 인자 개수가 8→9로 바뀌면 CREATE OR REPLACE는 "다른 함수"로 취급해 기존
-- 8인자 버전 위에 추가로 쌓인다(오버로드). 그러면 COMMENT ON FUNCTION이
-- "이름이 유일하지 않다"(42725)로 실패한다 — 실측으로 확인된 실패. 새로
-- CREATE하기 전에 옛 시그니처를 명시적으로 DROP해서 하나만 남긴다.
-- ============================================================================
DROP FUNCTION IF EXISTS upsert_club_lineup(UUID, DATE, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID);

CREATE OR REPLACE FUNCTION upsert_club_lineup(
  p_club_id       UUID,
  p_event_date    DATE,
  p_door_open_min INTEGER,
  p_event_title   TEXT,
  p_poster_url    TEXT,
  p_sets          JSONB,
  p_source        TEXT DEFAULT 'admin_manual',
  p_draft_id      UUID DEFAULT NULL,
  p_ticket_url    TEXT DEFAULT NULL
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

  INSERT INTO club_lineups (club_id, event_date, door_open_min, event_title, poster_url, source, created_by, draft_id, ticket_url)
  VALUES (p_club_id, p_event_date, p_door_open_min, p_event_title, p_poster_url, p_source, auth.uid(), p_draft_id, p_ticket_url)
  ON CONFLICT (club_id, event_date) DO UPDATE SET
    door_open_min = EXCLUDED.door_open_min,
    event_title   = EXCLUDED.event_title,
    poster_url    = COALESCE(EXCLUDED.poster_url, club_lineups.poster_url),
    source        = EXCLUDED.source,
    draft_id      = EXCLUDED.draft_id,
    ticket_url    = COALESCE(EXCLUDED.ticket_url, club_lineups.ticket_url),
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
  '라인업 저장의 유일한 경로. 수동/자동 공용. replace-all 방식. start_min/end_min 이 NULL 이면 시간 미표기 라인업(캡션 수집분)으로 sort_order 순서만 쓴다. ticket_url 은 COALESCE로 보존(재수집이 기존 값을 안 지움). (Migration 586)';
