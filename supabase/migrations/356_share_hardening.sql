-- ============================================================================
-- Migration 356: 조각 하드닝 (유저 주도 전환 정리)
-- 날짜: 2026-07-02
-- 내용:
--   1) MD 조각 자동생성 Cron 중단 (generate-share-listings weekly/daily)
--      → UI는 이미 차단됨. 기존 share_options 설정으로 인한 자동 생성도 정지.
--   2) 파티원 leave/kick 시 puzzle_party_reads 고아 행 정리 (안읽음 카운트 오염 방지)
--   3) 조각 인당 예산 최소 7만원 DB CHECK (클라 우회 방지)
-- ============================================================================

-- 1) MD 조각 자동생성 Cron 중단 -------------------------------------------------
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('generate-share-listings-weekly', 'generate-share-listings-daily')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron 미설치 환경(로컬 등) 무시
  NULL;
END $$;

-- 2) leave/kick 시 puzzle_party_reads 정리 ------------------------------------
--    leave_puzzle/kick_party_member 모두 puzzle_members에서 DELETE하므로
--    멤버 삭제 트리거로 일괄 처리(함수 재정의 불필요).
CREATE OR REPLACE FUNCTION cleanup_party_reads_on_member_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM puzzle_party_reads
  WHERE puzzle_id = OLD.puzzle_id AND user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_party_reads_trg ON puzzle_members;
CREATE TRIGGER cleanup_party_reads_trg
  AFTER DELETE ON puzzle_members
  FOR EACH ROW EXECUTE FUNCTION cleanup_party_reads_on_member_leave();

-- 3) 조각 인당 예산 최소 7만원 DB CHECK ----------------------------------------
--    NOT VALID: 기존 행(레거시/테스트 <7만)은 건너뛰고 신규 insert/update만 강제.
--    깃발(is_recruiting_party=false)은 영향 없음.
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS check_share_min_budget;
ALTER TABLE puzzles ADD CONSTRAINT check_share_min_budget
  CHECK (NOT is_recruiting_party OR budget_per_person >= 70000) NOT VALID;
