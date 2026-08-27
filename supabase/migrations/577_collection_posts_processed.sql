-- ============================================================================
-- Migration 577: 계정별 "이번에 실제로 파싱한 글 수" 기록
--
-- 왜(2026-08-27 첫 실행에서 드러남):
--   575 적용 후 첫 수집 결과가 no_lineup 85곳이었다. 고장처럼 보였지만
--   실제로는 게시물 290건 중 256건이 이미 처리된 것(permalink 선점 스킵)이라
--   LLM을 태우지도 않은 것이었다 — 매일 돌리는 구조에서는 이게 정상이다.
--
--   문제는 outcome 이 그 둘을 구분 못 한 것이다:
--     (a) 새 글을 봤는데 라인업이 없었다  = 진짜 no_lineup, 감시 해제 후보
--     (b) 새 글이 아예 없었다              = 정상, 아무 조치 불필요
--   같은 값으로 찍히면 매일 85곳이 "문제 있음"으로 뜨고, 그러면 아무도 안 본다.
--   경보가 매일 울리면 경보가 아니게 된다.
--
--   posts_processed 로 (b)를 분리하고, outcome 은 (a)일 때만 no_lineup 을 준다.
-- ============================================================================

ALTER TABLE collection_account_results
  ADD COLUMN IF NOT EXISTS posts_processed INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN collection_account_results.posts_processed IS
  '이번 실행에서 실제로 파싱까지 간 글 수. 0이면 새 글이 없었다는 뜻(중복 스킵) — 라인업이 없는 것과 다르다.';

-- 뷰가 새 컬럼을 노출하도록 재생성.
-- CREATE OR REPLACE 로는 안 된다 — 컬럼을 중간에 끼워넣는 건 "기존 컬럼 이름 변경"으로
-- 해석돼 42P16 으로 거부된다(lineups_saved → posts_processed). DROP 후 다시 만든다.
-- 뷰를 참조하는 get_collection_accounts() 도 함께 재생성한다.
DROP FUNCTION IF EXISTS get_collection_accounts();
DROP VIEW IF EXISTS admin_collection_accounts;

CREATE VIEW admin_collection_accounts AS
SELECT DISTINCT ON (r.ig_handle)
  r.ig_handle,
  r.club_id,
  r.club_name,
  r.outcome,
  r.posts_received,
  r.posts_own,
  r.posts_processed,
  r.lineups_saved,
  r.no_date_dropped,
  r.detail,
  r.created_at AS last_checked_at,
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
