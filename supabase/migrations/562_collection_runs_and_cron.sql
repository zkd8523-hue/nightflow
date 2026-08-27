-- ============================================================================
-- Migration 562: 수집 실행 로그 + health 뷰 + 포스터 버킷 + cron 스케줄
-- 날짜: 2026-08-26
-- 선행: 557~561
--
-- 조용한 실패 감지 — 3중 방어:
--   외부 소스는 죽어도 0건을 반환할 뿐이라 몇 주 뒤에야 발견된다. 이 프로젝트는
--   실제로 cron이 조용히 전부 실패하던 전례가 있다 (Migration 312 주석:
--   app.settings.* 가 프로덕션에서 NULL이라 net.http_post(url:=NULL)로 무발송이었음).
--   1) ig_sources.consecutive_failures — 3회 연속 실패 시 자동 격리(is_active=false)
--   2) admin_collection_health 뷰 — media_seen=0 은 토큰 만료/권한 취소의 신호
--   3) 능동 푸시 알림 — 대시보드 지표만으론 부족하다, 아무도 안 본다
--
-- cron 등록부는 Migration 312 형식을 정확히 복제한다: URL 하드코딩,
-- service_role_key 만 Vault. unschedule 루프는 356의 로컬 대비 패턴을 따른다.
-- ============================================================================

-- ============================================================================
-- 1) collection_runs — 실행 로그
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),

  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_ok INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,

  media_seen INTEGER NOT NULL DEFAULT 0,       -- API가 돌려준 게시물 총 수
  media_new INTEGER NOT NULL DEFAULT 0,        -- permalink 중복 제외 후
  drafts_created INTEGER NOT NULL DEFAULT 0,
  auto_published INTEGER NOT NULL DEFAULT 0,
  queued_for_review INTEGER NOT NULL DEFAULT 0,
  not_timetable INTEGER NOT NULL DEFAULT 0,

  errors JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{source_id, ig_username, stage, message}]
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_started ON collection_runs(started_at DESC);

ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_runs_admin_all ON collection_runs;
CREATE POLICY collection_runs_admin_all ON collection_runs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- 2) admin_collection_health — 조용한 실패 감지 뷰
-- ============================================================================
CREATE OR REPLACE VIEW admin_collection_health AS
SELECT
  (SELECT max(started_at) FROM collection_runs) AS last_run_at,
  (SELECT count(*) FROM collection_runs
     WHERE started_at > now() - interval '24 hours' AND media_seen = 0) AS zero_yield_runs_24h,
  (SELECT count(*) FROM ig_sources WHERE is_active AND consecutive_failures >= 2) AS degraded_sources,
  (SELECT count(*) FROM ig_sources WHERE NOT is_active AND consecutive_failures >= 3) AS quarantined_sources,
  (SELECT count(*) FROM lineup_drafts WHERE status = 'pending') AS pending_review,
  (SELECT count(*) FROM ig_sources s WHERE s.is_active
     AND (s.last_success_at IS NULL OR s.last_success_at < now() - interval '10 days')) AS stale_sources;

COMMENT ON VIEW admin_collection_health IS
  '수집 파이프라인 건강 지표. media_seen=0 반복은 개별 소스 문제가 아니라 토큰 만료/권한 취소 신호일 가능성이 높다.';

-- admin 전용 조회 (뷰 자체엔 RLS를 못 걸므로 함수로 감싼다)
CREATE OR REPLACE FUNCTION get_collection_health()
RETURNS SETOF admin_collection_health AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;
  RETURN QUERY SELECT * FROM admin_collection_health;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3) check_collection_health() — 임계 초과 시 관리자 푸시
--    notify_admins_push(p_title, p_body, p_data) — Migration 311 정의 재사용
-- ============================================================================
CREATE OR REPLACE FUNCTION check_collection_health()
RETURNS VOID AS $$
DECLARE
  v_health RECORD;
BEGIN
  SELECT * INTO v_health FROM admin_collection_health;

  IF v_health.zero_yield_runs_24h >= 3
     OR v_health.quarantined_sources >= 3
     OR v_health.last_run_at IS NULL
     OR v_health.last_run_at < now() - interval '12 hours'
  THEN
    PERFORM notify_admins_push(
      '⚠️ 라인업 수집 이상',
      format('24h 무수확 %s회, 격리 소스 %s곳, 검토대기 %s건. 마지막 실행: %s',
        v_health.zero_yield_runs_24h, v_health.quarantined_sources, v_health.pending_review,
        COALESCE(v_health.last_run_at::TEXT, '없음')),
      jsonb_build_object('url', '/admin/lineups')
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4) Storage 버킷: lineup-posters
--    auction-images 를 안 쓰는 이유: 그 버킷의 UPDATE/DELETE 정책이 첫 폴더
--    세그먼트=auth.uid() 를 요구해(Migration 033) service_role 소유 파일과 안 맞는다.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lineup-posters',
  'lineup-posters',
  true,
  8388608, -- 8MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read lineup posters" ON storage.objects;
CREATE POLICY "Public read lineup posters"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lineup-posters');

-- 쓰기는 admin(대시보드) + service_role(Edge Function) 만.
-- service_role 은 RLS를 우회하므로 정책 대상은 사실상 대시보드 admin 세션뿐이다.
DROP POLICY IF EXISTS "Admin write lineup posters" ON storage.objects;
CREATE POLICY "Admin write lineup posters"
  ON storage.objects FOR ALL
  USING (bucket_id = 'lineup-posters' AND is_admin())
  WITH CHECK (bucket_id = 'lineup-posters' AND is_admin());

-- ============================================================================
-- 5) cron 스케줄
--    매일 15시/21시 KST = 06:00/12:00 UTC. business_discovery 는 소스당 1회
--    호출이고 활성 소스 ~94곳이라 하루 188호출, 주 1,316호출 — rate limit
--    (200×DAU/시간) 대비 여유가 크다. priority 등급을 두지 않는 이유가 이것.
-- ============================================================================
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('collect-ig-lineups-afternoon', 'collect-ig-lineups-evening', 'ig-collection-health')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron 미설치 환경(로컬 등) 무시
  NULL;
END $$;

SELECT cron.schedule(
  'collect-ig-lineups-afternoon',
  '0 6 * * *', -- KST 15:00
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/collect-ig-lineups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{"mode":"cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'collect-ig-lineups-evening',
  '0 12 * * *', -- KST 21:00
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/collect-ig-lineups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{"mode":"cron"}'::jsonb
  );
  $$
);

-- health 체크는 DB 함수 직접 호출 (외부 API 아니라 net.http_post 불필요).
-- 505_share_live_toggle.sql 이 명시한 최신 선호 방향: 순수 DB 작업은 Edge Function을 안 거친다.
SELECT cron.schedule(
  'ig-collection-health',
  '30 6,12 * * *', -- 두 수집 잡 30분 뒤
  $$ SELECT check_collection_health(); $$
);

COMMENT ON FUNCTION check_collection_health IS
  'admin_collection_health 임계 초과 시 관리자 푸시. 대시보드 지표만으론 부족하다 — 아무도 안 본다.';
