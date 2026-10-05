-- 684: 수집 주기 확정 — 클럽 매일 유지, DJ 링크 발굴만 주 2회
--
-- 2026-10-04 Apify Starter($19/월 선불) 재구독. 674(격일화)는 무료 플랜($5)
-- 으로 내려갈 전제로 쓴 것이라 더 이상 맞지 않다. **674 는 적용하지 않는다.**
--
-- Migration 683 으로 수집 대상이 101곳 → 32곳이 되면서 월 비용이
-- $17.55 → $3.83 로 떨어졌다. $19 중 $15 가 남는다. 그 여유를 주기 단축과
-- 맞바꿀 이유가 없어 **매일 20:00 KST 를 유지**한다.
--
-- 격일이 나쁜 이유: 클럽이 라인업을 올리는 요일은 화 229건·수 234건이 최다다
-- (드래프트 1,153건, 업로드 시각 KST). 공연은 금·토에 열리지만 공지는 주중에
-- 올라온다. 격일이면 이 공지를 하루 늦게 잡고, ig_permalink UNIQUE 라
-- 한 번 놓친 글은 영영 안 들어온다.
--
-- 그래서 이 마이그레이션은 클럽 수집 스케줄을 **건드리지 않는다**(이미 매일).
-- 혹시 674 가 먼저 적용돼 격일로 바뀌어 있다면 아래가 매일로 되돌린다.

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'collect-club-events'
  LOOP PERFORM cron.unschedule(v_jobid); END LOOP;
END $$;

SELECT cron.schedule(
  'collect-club-events',
  '0 11 * * *', -- 매일 11:00 UTC = 20:00 KST
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

-- DJ 링크 발굴은 주 2회로 둔다(674 는 주 1회였다).
-- 매일 25건 = 월 $1.75 인데, 새 DJ 의 미리듣기 링크가 늦게 붙으면 카드뉴스가
-- 그 DJ 를 못 고른다. 주 1회는 최대 7일 지연이라 과하고, 월·목 2회면 최대 3~4일에
-- 월 $0.5 수준이다. 남는 예산($15)을 생각하면 이쪽이 맞다.
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'discover-dj-links'
  LOOP PERFORM cron.unschedule(v_jobid); END LOOP;
END $$;

SELECT cron.schedule(
  'discover-dj-links',
  '30 11 * * 1,4', -- 매주 월·목 11:30 UTC = 20:30 KST
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
--   → collect-club-events  '0 11 * * *'
--     discover-dj-links    '30 11 * * 1,4'
