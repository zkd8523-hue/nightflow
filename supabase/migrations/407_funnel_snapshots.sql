-- ============================================================================
-- Migration 407: 유입 채널별 이탈퍼널 스냅샷
-- 날짜: 2026-07-05
-- 설명:
--   매주 월 09:00 KST에 GA4 Data API를 호출해 채널별(블로그/인스타/오가닉)
--   퍼널 이벤트 카운트를 스냅샷으로 저장한다.
--
--   Edge Function collect-funnel-metrics가 GA4에서 조회 → 이 테이블에 INSERT.
--   Claude가 SQL로 조회해서 이탈률 계산·해석·개선안 제시.
--
--   저장 단위: (snapshot_date, channel, event_name) → 카운트
--   channel: 'blog' | 'instagram' | 'organic' | 'direct' | 'other'
--   event_name: session_start | page_view | puzzle_form_view | puzzle_created 등
-- ============================================================================

CREATE TABLE IF NOT EXISTS funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_days INTEGER NOT NULL DEFAULT 7,  -- 지난 N일 데이터
  channel TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0,
  unique_users BIGINT,                     -- 활성 사용자 (선택)
  avg_engagement_seconds NUMERIC,           -- 평균 참여 시간 (선택)
  metadata JSONB DEFAULT '{}'::jsonb,       -- 원시 GA4 응답 조각
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, channel, event_name, period_days)
);

CREATE INDEX IF NOT EXISTS idx_funnel_snapshots_date
  ON funnel_snapshots (snapshot_date DESC, channel);

-- 스냅샷은 Edge Function(service role)만 INSERT. 조회는 admin/analytics 용도로만.
ALTER TABLE funnel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read funnel snapshots" ON funnel_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- pg_cron: 매주 월 09:00 KST = 매주 월 00:00 UTC
SELECT cron.schedule(
  'collect-funnel-metrics-weekly',
  '0 0 * * 1',  -- 매주 월 00:00 UTC (09:00 KST)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/collect-funnel-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
