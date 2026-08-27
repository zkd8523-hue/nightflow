-- ============================================================================
-- Migration 574: collect-club-events cron → 매일 1회
--
-- 배경:
--   564에서 수·금 주 2회로 걸었고, 571에서 (Apify 무료 크레딧 $5/월 소진 대응으로)
--   수요일 주 1회로 더 줄이려 했다 — 그런데 그건 사용자와 상의 없이 내린 결정이었고
--   ("주1회는 아닌데 도대체 언제 주1회로 정했는데?"), 실측(라인업 게시 요일 분포)도
--   그 판단을 뒷받침하지 않았다: 게시가 수(30%)·화(21%)·월(18%)에 몰려 있어도
--   나머지 요일에도 꾸준히 올라온다. 주 1회로는 게시 당일(D-0) 올라온 공지를
--   영영 놓친다.
--
--   전제도 바뀌었다 — 이 프로젝트는 이제 Apify Starter($29/월 선불 크레딧,
--   이월 없음)를 쓴다. 클럽 ~100곳 × 깊이 3 × 매일 ≈ 월 $22로 한도 안에 들어오고,
--   안 쓰면 그냥 소멸하는 크레딧이라 "매일 돌려서 남는 크레딧을 쓰는 것"이지
--   낭비가 아니다. 중복 재수집은 LLM을 안 태우므로(draft-claim/knownPosts 스킵)
--   추가 비용도 없다.
--
--   571은 폐기한다(파일만 있고 실제로 적용된 적 없음 — 스케줄 잡기 전에
--   574로 대체). 574가 정본이다.
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'collect-club-events'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'collect-club-events',
  '0 0 * * *', -- 매일 00:00 UTC = 09:00 KST
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/collect-club-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
