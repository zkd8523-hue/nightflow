-- ============================================================================
-- Migration 564: 클럽 공연 아카이브 자동화 (수집 cron + 공개 노출)
-- 날짜: 2026-08-26
-- 설명:
--   563에서 만든 club_events를 "일회성 아카이브"에서 "매주 자동 갱신"으로 전환.
--   ① status에 'flagged' 추가 — 자동 승인하되 이상 건만 표시
--   ② 공개 읽기 정책 — /events 페이지가 approved 건을 익명으로 조회
--   ③ pg_cron 등록 — collect-club-events Edge Function을 주 2회 실행
--      (수·금 09:00 KST = 00:00 UTC. 큐레이션 계정이 주초 게시 → 주말 공연 전 확보)
--
--   수집 대상: ① @hiphopplayacalendar 큐레이션 + ② clubs.instagram 보유 클럽 전체
--   (승인·비테스트·미삭제). 전 과정 무인 자동 — 사람 개입 없음(사용자 결정).
--   파이프라인: Apify(계정별 최근 게시물) → 사전 필터 → LLM 파싱 → upsert.
--   Cron: 0 0 * * 3,5
-- ============================================================================

-- ============================================================================
-- 1) status CHECK에 'flagged' 추가
--    자동 파이프라인 규칙: 정상 → 'approved', 이상(과거 날짜/6개월 이상 미래/
--    라인업 없음/해외 지역) → 'flagged'. 'pending'은 기존 일회성 수집분.
-- ============================================================================
ALTER TABLE club_events DROP CONSTRAINT IF EXISTS club_events_status_check;
ALTER TABLE club_events ADD CONSTRAINT club_events_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'flagged'));

-- ============================================================================
-- 2) 공개 읽기 — approved 건만 익명 SELECT 허용 (/events 페이지, SEO)
-- ============================================================================
DROP POLICY IF EXISTS "anyone can read approved events" ON club_events;
CREATE POLICY "anyone can read approved events" ON club_events
  FOR SELECT USING (status = 'approved');

-- ============================================================================
-- 3) pg_cron 등록 — 수·금 00:00 UTC (09:00 KST)
--    312 Vault 패턴: URL 하드코딩 + service_role_key만 Vault에서 조회
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
  '0 0 * * 3,5',
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
