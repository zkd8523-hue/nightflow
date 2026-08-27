-- ============================================================================
-- Migration 567: 라인업 자동 수집을 위한 service_role 인제스트 경로
-- 날짜: 2026-08-26
-- 배경:
--   559의 upsert_club_lineup()은 is_admin()을 요구한다. Edge Function은
--   service_role로 실행되어 auth.uid()가 NULL이므로 이 RPC를 호출할 수 없다
--   (원 설계는 Admin 화면에서 사람이 저장하는 흐름을 전제했다).
--
--   business_discovery API가 막혀 원래 자동 수집 경로(collect-ig-lineups)가
--   동작하지 못하는 상태 — Apify 기반 collect-club-events가 유일한 수집 경로가
--   되었고, 이 함수가 라인업까지 채우려면 service_role 쓰기 경로가 필요하다.
--
--   ① can_write_lineups() — 라인업 전용 쓰기 게이트 (service_role 또는 admin)
--   ② ensure_dj() — DJ 표기 → djs/dj_aliases 자동 등록/조회 헬퍼
--      원 설계는 "별칭 학습은 사람이 승인"이었으나, 무인 자동 운영으로 방향이
--      바뀌어(사용자 결정) 자동 생성으로 전환한다. normalized UNIQUE 제약이
--      여전히 동일인 분열을 막는다.
--
-- ⚠️ is_admin() 은 절대 건드리지 않는다.
--    처음에는 is_admin() 에 service_role 을 추가하려 했으나, 이 함수는 109번부터
--    존재하며 115·284·533·537 에서 재정의된 전역 헬퍼로 **28개 마이그레이션이
--    공유**한다 (users RLS 락다운 533, 채팅 284, 와글 SHOT 315/322/325, 신고 488,
--    쿠폰 539, 건의게시판 495~502, 한줄평 275/276 ...).
--    여기에 service_role 통과를 넣으면 라인업 4개 테이블이 아니라 저 28개의 RLS가
--    동시에 열린다. 533이 일부러 users 를 잠그고 497이 anon leak 을 막은 방어선을
--    전역 함수 한 줄로 무르는 셈이라, 영향 범위를 라인업으로 한정한다.
-- ============================================================================

-- ============================================================================
-- 1) can_write_lineups() — 라인업 계열 전용 쓰기 게이트
--    Edge Function(service_role)은 auth.uid()가 NULL이라 is_admin()으로는 항상
--    false. 이 함수만 service_role 을 추가로 허용해 자동 수집 경로를 연다.
--    적용 대상: djs / dj_aliases / club_lineups / lineup_sets / lineup_drafts
--    (그 외 테이블의 RLS는 종전대로 is_admin() 을 그대로 쓴다)
-- ============================================================================
CREATE OR REPLACE FUNCTION can_write_lineups()
RETURNS BOOLEAN AS $$
  SELECT auth.role() = 'service_role' OR is_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION can_write_lineups() IS
  '라인업 계열(djs/dj_aliases/club_lineups/lineup_sets/lineup_drafts) 쓰기 게이트. service_role(Edge Function 자동 수집) 또는 admin. is_admin()은 28개 마이그레이션이 공유하는 전역 헬퍼라 건드리지 않는다.';

-- ============================================================================
-- 1-1) 라인업 4개 테이블 + drafts 의 쓰기 정책을 can_write_lineups() 로 교체
--      559에서 admin only 로 걸어둔 정책만 정확히 대체한다. 읽기 정책은 그대로.
-- ============================================================================
DROP POLICY IF EXISTS djs_write_admin ON djs;
CREATE POLICY djs_write_admin ON djs
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS dj_aliases_write_admin ON dj_aliases;
CREATE POLICY dj_aliases_write_admin ON dj_aliases
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS club_lineups_write_admin ON club_lineups;
CREATE POLICY club_lineups_write_admin ON club_lineups
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS lineup_sets_write_admin ON lineup_sets;
CREATE POLICY lineup_sets_write_admin ON lineup_sets
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS lineup_drafts_admin_all ON lineup_drafts;
CREATE POLICY lineup_drafts_admin_all ON lineup_drafts
  FOR ALL USING (can_write_lineups());

-- ============================================================================
-- 1-2) upsert_club_lineup() 의 가드도 can_write_lineups() 로 교체
--      559 원본과 본문은 동일하고 권한 체크 한 줄만 다르다.
-- ============================================================================
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
      (v_set->>'start_min')::INTEGER,
      (v_set->>'end_min')::INTEGER,
      v_set->>'raw_name',
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'lineup_id', v_lineup_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2) ensure_dj() — DJ 표기로 djs 행을 찾거나 만들고 id를 돌려준다
--    dj_aliases.normalized UNIQUE 가 "DJ BERMUDA / BERMUDA DJ / bermuda"를
--    한 dj_id 로 모은다. 한글↔영문(버뮤다 vs bermuda)은 자동 매칭되지 않으며
--    Admin에서 수동 연결해야 한다 — djName.ts 주석과 동일한 규약.
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_dj(p_raw_name TEXT, p_normalized TEXT)
RETURNS UUID AS $$
DECLARE
  v_dj_id UUID;
  v_slug  TEXT;
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
  ON CONFLICT (normalized) DO NOTHING;

  RETURN v_dj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION ensure_dj(TEXT, TEXT) IS
  'DJ 표기 → djs 행 조회/생성 후 id 반환. dj_aliases.normalized UNIQUE 로 동일인 분열 방지. 자동 수집(collect-club-events)에서 호출.';
