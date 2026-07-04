-- ============================================================================
-- Migration 408: user_events — 익명 유저 여정 추적 raw 로그
-- 날짜: 2026-07-05
-- 목표: 세션→깃발 전환율 극대화. 이탈 지점·유입 채널별 여정 SQL 조회.
--
-- 설계 원칙:
--   1. anon_id로 로그인 전/후 모두 추적 (localStorage UUID)
--   2. 세션 30분 무활동 시 갱신 (GA4 표준)
--   3. 유입 정보(utm_*, referrer, landing_path)는 세션 첫 이벤트에 기록
--   4. properties JSONB로 이벤트별 확장 (스키마 흔들림 방지)
--   5. 90일 rolling 자동 삭제 (프라이버시 + 용량)
--
-- 관련: funnel_snapshots(집계), foreign_funnel(외국인 트랙), Mixpanel(대시보드)
--       user_events는 raw. Claude가 SQL로 임의 조회할 때 사용.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,

  -- 유저 식별
  anon_id TEXT NOT NULL,               -- localStorage UUID (로그인 전에도 유지)
  user_id UUID,                         -- auth.users.id (로그인 후에만 채워짐)
  session_id TEXT NOT NULL,             -- anon_id + 세션 시작 시각 hash

  -- 이벤트
  event_name TEXT NOT NULL,             -- 'home_view', 'flag_created' 등

  -- 유입 (세션 첫 이벤트에서만 채워짐. 이후 이벤트도 조인 편의상 유지)
  utm_source TEXT,                      -- 'blog' | 'instagram' | 'organic' | 'direct' | 'other'
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,                        -- document.referrer
  landing_path TEXT,                    -- 세션 첫 페이지

  -- 컨텍스트
  path TEXT,                            -- 현재 페이지 URL path
  device_type TEXT,                     -- 'mobile' | 'desktop' | 'tablet'
  lang TEXT,                            -- 'ko' | 'en' | 'ja' | 'zh'

  -- 유연 확장
  properties JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 인덱스 3개 — 유저 여정, 세션, 이벤트 타임라인
CREATE INDEX IF NOT EXISTS idx_user_events_anon_time
  ON user_events (anon_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_events_session_time
  ON user_events (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_events_event_time
  ON user_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_events_user_time
  ON user_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- RLS: 익명 유저 INSERT는 허용, SELECT는 admin만.
-- (SELECT를 유저에게 열면 다른 사람 여정도 볼 수 있어서 위험)
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert events" ON user_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admins can read events" ON user_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 90일 rolling 자동 삭제 (매일 04:00 UTC = 13:00 KST 새벽)
SELECT cron.schedule(
  'purge-user-events-daily',
  '0 4 * * *',
  $$
  DELETE FROM user_events WHERE created_at < now() - INTERVAL '90 days';
  $$
);

-- ============================================================================
-- 뷰: user_sessions — anon_id×session_id 단위로 여정 요약
-- Claude가 "이 유저 어디서 이탈?" 질문 시 이 뷰 사용
-- ============================================================================
CREATE OR REPLACE VIEW user_sessions AS
SELECT
  session_id,
  anon_id,
  -- 세션 중 로그인했으면 채워짐. MAX(uuid) 미지원이라 서브쿼리로 최근 non-null 하나.
  (ARRAY_AGG(user_id) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
  MAX(utm_source) AS utm_source,
  MAX(utm_medium) AS utm_medium,
  MAX(utm_campaign) AS utm_campaign,
  MAX(referrer) AS referrer,
  MAX(landing_path) AS landing_path,
  MAX(device_type) AS device_type,
  MAX(lang) AS lang,
  MIN(created_at) AS session_started_at,
  MAX(created_at) AS session_ended_at,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::INT AS duration_seconds,
  COUNT(*) AS event_count,
  ARRAY_AGG(event_name ORDER BY created_at) AS event_sequence,   -- 순서대로 이벤트명
  ARRAY_AGG(path ORDER BY created_at) FILTER (WHERE path IS NOT NULL) AS path_sequence,
  -- 전환 플래그
  BOOL_OR(event_name = 'flag_created') AS did_create_flag,
  BOOL_OR(event_name = 'login_success') AS did_login,
  BOOL_OR(event_name = 'flag_form_view') AS reached_form,
  BOOL_OR(event_name = 'home_cta_click') AS clicked_home_cta,
  -- 마지막 이벤트 (이탈 지점 파악용)
  (ARRAY_AGG(event_name ORDER BY created_at DESC))[1] AS last_event
FROM user_events
GROUP BY session_id, anon_id;

COMMENT ON VIEW user_sessions IS
  '세션 단위 여정 요약. Claude가 이탈 지점·전환율 SQL 조회 시 사용';

COMMENT ON TABLE user_events IS
  '익명 유저 raw 이벤트 로그. anon_id로 로그인 전/후 여정 이어붙임. 90일 rolling.';
