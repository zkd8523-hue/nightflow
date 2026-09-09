-- ============================================================================
-- Migration 664: 외국인 트랙 전환 개선 — 리마인더 테이블 + 최근 예약 RPC + 접수 이메일 트리거
--
-- 배경(2026-09-09 /en 퍼널 실측): 여행확정 게이트 통과 91세션 중 제출 8건.
--   ① "아직 계획중"이 하드 데드엔드였다 → 요청 대신 이메일만 받아두고 D-3에 링크를
--      보내는 소프트 게이트로 바꾼다. 계획 단계 요청이 관리자 큐·MD 제안서에 섞이지
--      않도록 foreign_requests가 아니라 별도 테이블에 담는다.
--   ② 홈의 "N requests on-going" 카운터가 0으로 렌더되면 역효과 소셜프루프였다 →
--      실제 확정 예약(booking_confirmations)을 익명화해 보여주는 RPC를 둔다.
--   ③ 제출 후 dead end — 이메일로 연락처를 남긴 손님에게 접수 확인 메일을 보낸다.
--      발송은 Edge Function foreign-guest-emails(Resend). 트리거 실패가 INSERT를
--      막지 않도록 예외를 삼킨다(Migration 455와 같은 원칙).
--
-- 참조: 454(foreign_requests) 489(익명 INSERT·24h 중복) 580(pg_cron → Edge Function)
--      633(booking_confirmations) 638(count_open_foreign_requests)
-- 배포 순서: 이 마이그레이션 → Edge Function foreign-guest-emails 배포 → 코드 배포
-- ============================================================================

-- ── ① 여행 미확정 손님 리마인더 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS foreign_trip_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- anon이 바로 넣는 값이라 형식·길이를 DB에서 막는다(잘못된 주소가 Resend 발송으로 이어지지 않게).
  email TEXT NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' AND length(email) <= 254),
  lang TEXT NOT NULL DEFAULT 'en' CHECK (length(lang) <= 8),
  area TEXT CHECK (area IS NULL OR length(area) <= 32),
  -- 손님이 폼에 적은 잠정 날짜. 이 날짜 3일 전 19:00 KST에 메일이 나간다.
  tentative_date DATE NOT NULL,
  group_size INTEGER,
  landing_path TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_reminders_due
  ON foreign_trip_reminders (tentative_date) WHERE sent_at IS NULL;
-- 24h 중복 검사(lower(email))가 매 INSERT마다 도는 경로 — 함수 인덱스가 없으면 전체 스캔.
CREATE INDEX IF NOT EXISTS idx_trip_reminders_email_recent
  ON foreign_trip_reminders (lower(email), created_at DESC);
COMMENT ON TABLE foreign_trip_reminders IS
  '여행 미확정 외국인 손님의 D-3 리마인더 대기열. foreign_requests가 아니다 — 관리자 큐·MD 제안서에 안 섞인다.';

ALTER TABLE foreign_trip_reminders ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON foreign_trip_reminders TO anon, authenticated;
DROP POLICY IF EXISTS "anyone can leave a trip reminder" ON foreign_trip_reminders;
CREATE POLICY "anyone can leave a trip reminder" ON foreign_trip_reminders
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admins read trip reminders" ON foreign_trip_reminders;
CREATE POLICY "admins read trip reminders" ON foreign_trip_reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 같은 이메일로 24시간 안에 여러 건 쌓이는 것 방지(489와 같은 방식).
CREATE OR REPLACE FUNCTION check_trip_reminder_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM foreign_trip_reminders
    WHERE lower(email) = lower(NEW.email)
      AND created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'duplicate_trip_reminder_within_24h';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trip_reminder_rate_limit ON foreign_trip_reminders;
CREATE TRIGGER trip_reminder_rate_limit
  BEFORE INSERT ON foreign_trip_reminders
  FOR EACH ROW EXECUTE FUNCTION check_trip_reminder_rate_limit();

-- 매일 19:00 KST(10:00 UTC) — Edge Function이 tentative_date = 오늘+3 인 행에 발송.
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'foreign-trip-reminders'
  LOOP PERFORM cron.unschedule(v_jobid); END LOOP;
END $$;
SELECT cron.schedule(
  'foreign-trip-reminders',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/foreign-guest-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{"mode":"reminders"}'::jsonb
  );
  $$
);

-- ── ② 홈 소셜프루프: 최근 확정 예약(익명) ───────────────────────────────────
-- booking_confirmations는 RLS로 anon이 못 읽는다. 행 대신 "클럽·지역·인원·언제"만 내준다.
CREATE OR REPLACE FUNCTION recent_foreign_bookings(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  club_name TEXT,
  area TEXT,
  -- confirmed_group_size는 TEXT(Migration 637)라 문자열로 통일한다.
  group_size TEXT,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(NULLIF(c.name_en, ''), c.name) AS club_name,
    c.area,
    COALESCE(NULLIF(bc.confirmed_group_size, ''), fr.group_size::text) AS group_size,
    bc.created_at AS confirmed_at
  FROM booking_confirmations bc
  JOIN foreign_requests fr ON fr.id = bc.request_id
  LEFT JOIN clubs c ON c.id = COALESCE(bc.club_id, fr.club_ids[1])
  WHERE fr.status <> 'cancelled'
    AND c.id IS NOT NULL
    AND COALESCE(c.is_test, false) = false
  ORDER BY bc.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10));
$$;
GRANT EXECUTE ON FUNCTION recent_foreign_bookings(INTEGER) TO anon, authenticated;

-- ── ③ 접수 번호 — 손님·이메일·관리자가 같은 번호를 본다 ───────────────────────
-- 손님 화면과 이메일이 id 앞 6자로 만들던 번호를 컬럼으로 고정해 관리자 목록에서 바로 찾게 한다.
ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS ref_code TEXT GENERATED ALWAYS AS ('NF-' || upper(left(id::text, 6))) STORED;
CREATE INDEX IF NOT EXISTS idx_foreign_requests_ref_code ON foreign_requests(ref_code);
COMMENT ON COLUMN foreign_requests.ref_code IS '손님에게 보여주는 접수 번호(NF-XXXXXX = id 앞 6자). 폼·이메일·관리자 동일.';

-- ── ④ 접수 확인 이메일 트리거 ───────────────────────────────────────────────
-- contact_type = 'email'일 때만. 발송은 Edge Function(Resend). 실패해도 INSERT는 살린다.
CREATE OR REPLACE FUNCTION notify_guest_foreign_request_received()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF NEW.contact_type <> 'email' THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    PERFORM net.http_post(
      url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/foreign-guest-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_key, '')
      ),
      body := jsonb_build_object('mode', 'received', 'request_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guest_foreign_request_received failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS foreign_request_guest_email ON foreign_requests;
CREATE TRIGGER foreign_request_guest_email
  AFTER INSERT ON foreign_requests
  FOR EACH ROW EXECUTE FUNCTION notify_guest_foreign_request_received();
