-- ============================================================================
-- Migration 575: 수집 실행 결과를 계정 단위로 남긴다
--
-- 왜 필요한가 (2026-08-27 실측):
--   collect-club-events 는 카운터를 17종이나 세면서 console.log 로만 뱉고 버린다.
--   그래서 오늘 하루에만 아래 네 가지가 "조용히" 실패하고 있었고, 전부 사용자가
--   화면을 눈으로 보고 발견했다:
--     1. max_tokens 3000 에서 응답이 잘려 월간 스케줄이 통째로 빈 결과가 됨
--     2. 날짜 규칙이 과해서 sets 를 다 뽑고도 event_date=null 로 폐기 (16건)
--     3. 감시 계정이 Restricted 라 액터가 "남의 계정 글"을 대신 주는데
--        코드가 else 없이 스킵 (36곳 조회 중 18건)
--     4. groovenspot 등 4곳은 Restricted profile 로 애초에 데이터가 안 옴
--   1·2번은 lineup_no_date / parse_failures 카운터만 봤어도 당일 잡혔다.
--   3·4번은 "요청한 계정 != 받은 글의 주인" 이라는 사실을 계정 단위로 남겨야
--   보인다 — 실행 단위 합계(collection_runs)로는 절대 안 보인다.
--
--   collection_runs(562) 는 이미 있지만 (a) 폐기 예정인 collect-ig-lineups 만
--   쓰고 있고 (b) 실행 전체 합계라 계정별 원인이 안 남는다. 그래서 합계는
--   그 테이블을 그대로 쓰고, 계정별 결과만 이 테이블을 새로 둔다.
--
-- 조치까지 이어지게 하는 게 목적이다. outcome 별로 할 일이 다르다:
--   restricted   -> 자동 수집 불가. 관리자 수동 업로드로 돌려야 함
--   not_found    -> 핸들이 틀렸거나 폐업. clubs.instagram 을 고쳐야 함
--   tagged_only  -> 본인 글은 못 받고 태그된 남의 글만 옴 (지금은 살려서 씀)
--   no_lineup    -> 글은 받았는데 라인업이 없음 (홍보만 하는 계정일 수 있음)
--   ok           -> 정상
-- ============================================================================

CREATE TABLE IF NOT EXISTS collection_account_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES collection_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  ig_handle TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  club_name TEXT,

  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'restricted', 'not_found', 'tagged_only', 'no_lineup', 'error')),

  posts_received INTEGER NOT NULL DEFAULT 0,   -- 이 계정을 요청해서 받은 글 수
  posts_own INTEGER NOT NULL DEFAULT 0,        -- 그중 실제로 이 계정이 올린 글
  lineups_saved INTEGER NOT NULL DEFAULT 0,
  events_saved INTEGER NOT NULL DEFAULT 0,
  no_date_dropped INTEGER NOT NULL DEFAULT 0,  -- 출연자는 뽑았는데 날짜가 없어 버린 수
  detail TEXT                                  -- 액터 에러 메시지 등 원문
);

CREATE INDEX IF NOT EXISTS idx_car_run ON collection_account_results(run_id);
CREATE INDEX IF NOT EXISTS idx_car_handle_created ON collection_account_results(ig_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_outcome ON collection_account_results(outcome, created_at DESC);

ALTER TABLE collection_account_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS car_admin_all ON collection_account_results;
CREATE POLICY car_admin_all ON collection_account_results
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
-- Edge Function 은 service_role 로 붙으므로 RLS 를 우회한다(다른 수집 테이블과 동일).

-- ============================================================================
-- 계정별 최신 상태 — admin 화면이 이거 하나만 읽으면 되게
-- ============================================================================
CREATE OR REPLACE VIEW admin_collection_accounts AS
SELECT DISTINCT ON (r.ig_handle)
  r.ig_handle,
  r.club_id,
  r.club_name,
  r.outcome,
  r.posts_received,
  r.posts_own,
  r.lineups_saved,
  r.no_date_dropped,
  r.detail,
  r.created_at AS last_checked_at,
  -- 마지막으로 라인업을 실제로 건진 시각. 오래됐으면 조용히 죽은 계정이다.
  (SELECT max(r2.created_at) FROM collection_account_results r2
     WHERE r2.ig_handle = r.ig_handle AND r2.lineups_saved > 0) AS last_lineup_at
FROM collection_account_results r
ORDER BY r.ig_handle, r.created_at DESC;

COMMENT ON VIEW admin_collection_accounts IS
  '계정별 마지막 수집 결과. outcome=restricted/not_found 는 코드로 못 고치므로 사람이 조치해야 한다.';

CREATE OR REPLACE FUNCTION get_collection_accounts()
RETURNS SETOF admin_collection_accounts AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;
  RETURN QUERY SELECT * FROM admin_collection_accounts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- collection_runs 에 이번 파이프라인이 세는 값 몇 개 추가
-- (기존 컬럼은 collect-ig-lineups 가 쓰므로 건드리지 않는다)
-- ============================================================================
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS source TEXT;              -- 'club-events' | 'ig-lineups'
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS no_date_dropped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS parse_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS events_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS counters JSONB NOT NULL DEFAULT '{}'::jsonb;
