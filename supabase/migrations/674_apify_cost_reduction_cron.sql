-- ============================================================================
-- Migration 674: 수집 주기 격일화 + DJ 링크 발굴 주 1회 — Apify 비용 절감
-- 날짜: 2026-09-26
-- 선행: collect-club-events / discover-dj-links 재배포(상수 변경 포함)
--
-- 왜:
--   직전 주기(8/26~9/25) Apify 사용액이 $40.09 로 상한 $40 을 채웠고,
--   9/23 에 한도가 차서 수집이 3일간 완전히 멈췄다(9/24~26 라인업 0건).
--   구독을 해지해 10/26 부터 무료 플랜(월 $5)으로 내려간다 — 그 전에
--   월 $17.5 를 $5 아래로 낮춰야 한다.
--
-- 무엇이 낭비였나(실측):
--   비용 = 고유 게시물 수 × (날짜창 ÷ 실행주기). 매일 실행에 창이 3일이라
--   같은 글을 3번씩 샀다. collection_runs 12회 기준 중복률 59%
--   (수신 1680 / 신규 682). 중복에만 $2.30 을 썼다.
--
--   그런데 3일치를 사서 건진 게 없었다: 9월 드래프트 762건의 게시→수집 간격이
--   당일 734건(96%) / 1일 20건 / 2일 8건 / 3일 이상 **0건**.
--
-- 왜 격일인가:
--   창과 주기를 맞추면 중복이 0 이 된다. "매일+창1일" 도 비용은 같지만 여유가
--   없어 cron 이 한 번만 실패해도 그날 글을 영영 놓친다(ig_permalink UNIQUE).
--   9/23 사고가 정확히 그 경우였다. 격일+창2일은 같은 값에 한 주기 여유가 있다.
--   대가: 라인업이 최대 2일 늦게 뜬다(금요일 밤 공지가 토요일 수집).
-- ============================================================================

-- 1) 클럽 수집: 매일 20:00 KST → 격일 20:00 KST
--
-- ⚠️ '*/2' 는 일(day-of-month) 필드라 홀수일(1,3,5…31)에 돈다. 31일 다음이
--    1일이라 월말에 하루 간격이 생기고, 30일로 끝나는 달은 30→1 로 2일 간격이
--    된다. 창이 2일이라 둘 다 커버된다.
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
  '0 11 */2 * *', -- 격일 11:00 UTC = 20:00 KST
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

-- 2) DJ 링크 발굴: 매일 20:30 KST → 매주 월요일 20:30 KST
--
-- 실측 하루 25건($0.06) = 월 $1.75 인데, 631 주석은 "월 $1 미만"으로 예상했었다.
-- 주 1회면 월 $0.25 다. 새 DJ 의 미리듣기 링크가 최대 7일 늦게 붙는 게 대가다
-- (카드뉴스가 미리듣기 있는 DJ만 고르므로 갓 들어온 DJ는 첫 주 제외될 수 있다).
-- 밀린 인원을 한 번에 처리하도록 MAX_PER_RUN 을 50 → 120 으로 올렸다.
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
  '30 11 * * 1', -- 매주 월요일 11:30 UTC = 20:30 KST
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
--   → collect-club-events  '0 11 */2 * *'
--     discover-dj-links    '30 11 * * 1'
--
-- 4회 실행 뒤 검증:
--   SELECT started_at, media_seen, media_new,
--          round(media_new::numeric / NULLIF(media_seen,0), 2) AS new_ratio
--   FROM collection_runs ORDER BY started_at DESC LIMIT 4;
--   → new_ratio 가 1.0 에 가까워야 한다(직전 0.41). 낮으면 창·주기가 여전히
--     어긋난 것이다.
