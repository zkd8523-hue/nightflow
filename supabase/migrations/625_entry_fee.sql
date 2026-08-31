-- ============================================================================
-- Migration 625: club_events / club_lineups — entry_fee_text 컬럼 추가
-- 날짜: 2026-08-31
-- 배경:
--   라인업 상세에 "얼마 내고 들어가는지"가 없다. 그런데 캡션에는 이미 적혀 있다
--   (실측, 2026-08-31 수집분):
--     THE HENZ CLUB — "Entrance fee 20,000won (+1 free drink)"
--     Cakeshop      — "15,000₩ at RA / At Door 20,000₩ / after 12 25,000₩"
--   586(ticket_url)과 같은 판단이다 — 이미 읽고 있는 캡션에서 필드 하나 더
--   뽑는 것뿐이라 LLM 호출이 늘지 않는다(비용 0).
--
-- 왜 구조화(min/door/late 컬럼 분리)가 아니라 텍스트 한 줄인가:
--   클럽마다 가격 체계가 제각각이다. 위 두 예시만 봐도 HENZ는 단일가+프리드링크,
--   Cakeshop은 예매/도어/심야 3단이다. 여기에 여성무료·게스트리스트·보증금까지
--   섞이면 어떤 컬럼 조합도 절반은 빈칸이 되고, 못 담는 케이스는 조용히 버려진다.
--   목적이 "얼마인지 보여주기"라면 원문 한 줄이 손실 없이 담긴다.
--   정렬·필터가 필요해지면 그때 쌓인 실제 표기를 보고 구조를 뽑는 게 순서다.
--
--   가격 정보가 없으면 null — UI는 해당 줄을 그리지 않는다.
-- ============================================================================

ALTER TABLE club_events  ADD COLUMN IF NOT EXISTS entry_fee_text TEXT;
ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS entry_fee_text TEXT;

COMMENT ON COLUMN club_events.entry_fee_text IS
  '캡션에 명시된 입장료/가격 안내 한 줄. 모델이 지어내지 않는다는 전제(프롬프트 규칙) — 캡션에 없으면 null. 원문 표기를 그대로 옮기되 한 줄로 정리한다. 예: "도어 20,000원 (프리드링크 1잔)", "예매 15,000원 / 도어 20,000원 / 24시 이후 25,000원". (Migration 625)';
COMMENT ON COLUMN club_lineups.entry_fee_text IS
  '캡션에 명시된 입장료/가격 안내 한 줄. club_events.entry_fee_text와 동일 규칙. (Migration 625)';

-- ============================================================================
-- upsert_club_lineup 재정의 — p_entry_fee_text 파라미터 추가
-- 586 원문에서 이 한 줄만 다르다: INSERT/ON CONFLICT에 entry_fee_text 반영.
-- 기존 호출부(admin API, Edge Function)는 named object로 호출하고 새 인자에
-- 기본값 NULL이 있어 그대로 동작한다.
--
-- ⚠️ 586 주석의 경고 그대로 — 인자 개수가 9→10으로 바뀌면 CREATE OR REPLACE가
-- "다른 함수"로 취급해 오버로드가 쌓이고 COMMENT ON FUNCTION이 42725로 실패한다.
-- 새로 CREATE하기 전에 옛 9인자 시그니처를 명시적으로 DROP한다.
-- ============================================================================
DROP FUNCTION IF EXISTS upsert_club_lineup(UUID, DATE, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID, TEXT);

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
  p_entry_fee_text TEXT DEFAULT NULL
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

  INSERT INTO club_lineups (club_id, event_date, door_open_min, event_title, poster_url, source, created_by, draft_id, ticket_url, entry_fee_text)
  VALUES (p_club_id, p_event_date, p_door_open_min, p_event_title, p_poster_url, p_source, auth.uid(), p_draft_id, p_ticket_url, p_entry_fee_text)
  ON CONFLICT (club_id, event_date) DO UPDATE SET
    door_open_min  = EXCLUDED.door_open_min,
    event_title    = EXCLUDED.event_title,
    poster_url     = COALESCE(EXCLUDED.poster_url, club_lineups.poster_url),
    source         = EXCLUDED.source,
    draft_id       = EXCLUDED.draft_id,
    ticket_url     = COALESCE(EXCLUDED.ticket_url, club_lineups.ticket_url),
    entry_fee_text = COALESCE(EXCLUDED.entry_fee_text, club_lineups.entry_fee_text),
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
  '라인업 저장의 유일한 경로. 수동/자동 공용. replace-all 방식. start_min/end_min 이 NULL 이면 시간 미표기 라인업(캡션 수집분)으로 sort_order 순서만 쓴다. ticket_url / entry_fee_text 는 COALESCE로 보존(재수집이 기존 값을 안 지움). (Migration 625)';
