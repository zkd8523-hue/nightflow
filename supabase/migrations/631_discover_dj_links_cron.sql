-- ============================================================================
-- Migration 631: discover-dj-links cron — 매일 20:30 KST
-- 날짜: 2026-09-03
-- 선행: 630(links_checked_at), discover-dj-links Edge Function 배포
--
-- 왜 필요한가:
--   collect-club-events(매일 20:00 KST)는 캡션에서 DJ 이름과 @핸들까지만 저장한다.
--   그 핸들로 인스타 프로필을 열어 사클/유튜브를 찾는 건 수동 스크립트뿐이었고,
--   마지막 실행이 8/30 이었다. 그 뒤 새로 들어온 DJ 279명은 미리듣기가 비어 있다.
--   수집만 자동이고 발굴이 수동이면 커버리지가 계속 떨어진다.
--
-- 왜 20:30 인가:
--   수집(20:00)이 새 DJ 행을 만든 뒤에 돌아야 그 DJ 들을 대상으로 잡는다.
--   수집은 보통 몇 분 안에 끝나므로 30분이면 충분하고, 겹쳐 돌 일도 없다.
--
-- 비용:
--   Apify 프로필 조회 건당 $0.0023. Edge Function 이 MAX_PER_RUN=50 으로 상한을
--   두고, links_checked_at 으로 이미 본 DJ 를 걸러 하루 새 DJ(보통 10~20명)만
--   조회한다 → 월 $1 미만. 상한에 걸려도 하루 최대 $0.12 다.
-- ============================================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'discover-dj-links'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'discover-dj-links',
  '30 11 * * *', -- 매일 11:30 UTC = 20:30 KST (수집 30분 뒤)
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/discover-dj-links',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 확인:
--   SELECT jobname, schedule FROM cron.job ORDER BY jobname;
--   → collect-club-events(0 11) 과 discover-dj-links(30 11) 둘 다 있어야 한다.
