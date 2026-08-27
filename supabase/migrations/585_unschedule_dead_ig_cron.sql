-- ============================================================================
-- Migration 585: 죽은 collect-ig-lineups cron 3개 해제
-- 날짜: 2026-08-27
-- 배경:
--   562가 등록한 cron 3개가 아직 살아 있는데, 그게 호출하는
--   collect-ig-lineups(Instagram business_discovery API 경로)는 폐기됐다.
--
--   실측(2026-08-27):
--     - collect-ig-lineups 엔드포인트 → HTTP 404 (배포 안 됨)
--     - ig_sources 95건 전부 last_polled_at IS NULL → 한 번도 실행된 적 없음
--
--   567 주석이 이미 명시했다: "business_discovery API가 막혀 원래 자동 수집
--   경로(collect-ig-lineups)가 동작하지 못하는 상태". 575도 "폐기 예정"이라
--   기록했지만, cron을 unschedule 하는 마이그레이션은 아무도 안 만들었다.
--   결과: 매일 2회(15시/21시 KST) 없는 함수에 404를 때리고, 그 30분 뒤
--   check_collection_health()가 빈 ig_sources를 보고 무의미한 판정을 한다.
--
--   현재 정본 수집 경로는 collect-club-events(Apify 기반, 574→580 cron).
--
-- ⚠️ ig_sources 테이블과 collect-ig-lineups 코드 자체는 남긴다 —
--    business_discovery가 다시 열릴 여지가 있고, 지우면 되돌리기 비용이 크다.
--    여기서는 cron만 끊는다.
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'collect-ig-lineups-afternoon',
      'collect-ig-lineups-evening',
      'ig-collection-health'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron 미설치 환경(로컬 등) 무시 — 562와 동일한 방어
  NULL;
END $$;

-- ============================================================================
-- 적용 후 확인:
--   SELECT jobname, schedule FROM cron.job ORDER BY jobname;
--   → collect-ig-lineups-* / ig-collection-health 3개가 사라져야 정상.
--   → collect-club-events 는 남아 있어야 한다(정본 수집 경로).
-- ============================================================================
