-- ============================================================================
-- Migration 691: 접수확인 이메일 복구 + 비로그인 예약조회
--
-- 배경(2026-10-05 실측): 접수확인 이메일이 설계만 되고 한 통도 나가지 않았다.
--   ① Migration 664의 트리거가 contact_type = 'email'일 때만 발동했다. 그런데
--      Migration 669(9/19)로 폼이 "메신저 + 예비이메일 필수" 구조로 바뀌어서,
--      9/9 이후 접수 6건이 전부 line·instagram·whatsapp — 트리거가 매번 즉시
--      return하고 Edge Function은 호출조차 되지 않았다.
--   ② Edge Function이 공개 엔드포인트(verify_jwt = false)인데, 중복 호출을
--      막을 장치가 없었다. 발송 기록 컬럼을 두어 같은 건에 두 번 보내지 않게 한다.
--      (운영자가 "이 손님이 접수확인을 받았나"를 확인할 수단도 지금까지 없었다.)
--
-- ③ 비로그인 예약조회: 손님용 링크는 booking_confirmations.public_token
--    (→ /booking/{token}, Mig 633) 하나다. 없던 것은 그 링크를 잃어버렸을 때
--    되찾는 길이다. 접수번호 + 이메일로만 되찾게 한다(계정 없음 — 외국인
--    트랙은 로그인을 요구하지 않는다).
--    ⚠️ proposal_token(Mig 648)은 넘기지 않는다 — /booking/proposal/{token}은
--       MD용 제안서 페이지다. 손님에게 주면 MD 화면이 노출된다.
--
-- 한국 예약(korean_booking_requests)은 범위에서 제외한다 — 로그인 기반이라
-- 마이페이지로 이미 조회된다.
--
-- 참조: 454(foreign_requests) 489(익명 INSERT) 633 648 664 669
-- 배포 순서: 이 마이그레이션 → Edge Function foreign-guest-emails 재배포 → 코드 배포
-- ============================================================================

-- ── ① 발송 기록 컬럼 ────────────────────────────────────────────────────────
ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS guest_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN foreign_requests.guest_email_sent_at IS
  '손님 접수확인 이메일을 보낸 시각. 중복 발송 차단 + 운영자가 수신 여부를 확인하는 용도(Migration 691).';

-- ── ② 트리거 조건 수정 — 메신저로 접수한 손님도 예비이메일로 받는다 ─────────
CREATE OR REPLACE FUNCTION notify_guest_foreign_request_received()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- contact_type='email'이면 contact_value가, 메신저면 backup_email이 수신 주소다.
  -- Edge Function이 같은 규칙으로 주소를 고른다.
  IF NEW.contact_type <> 'email' AND NEW.backup_email IS NULL THEN
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

-- ── ③ 조회 시도 기록 (무차별 대입 방지) ─────────────────────────────────────
-- 접수번호는 6자리 hex(1,600만 조합)이고 이메일까지 동시에 맞아야 열린다. 그래도
-- 이메일을 아는 사람이 번호만 돌려보는 경우를 막아야 해서 이메일 기준으로 센다.
CREATE TABLE IF NOT EXISTS foreign_lookup_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lookup_attempts_email_recent
  ON foreign_lookup_attempts (email, created_at DESC);
ALTER TABLE foreign_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = anon·authenticated 직접 접근 불가. RPC(SECURITY DEFINER)만 쓴다.
COMMENT ON TABLE foreign_lookup_attempts IS
  '비로그인 예약조회 시도 기록. 이메일 기준 분당 10회 제한용(Migration 691).';

-- ── ④ 예약조회 RPC ─────────────────────────────────────────────────────────
-- 접수번호 + 이메일이 둘 다 맞아야 1행. 틀리면 0행 — 어느 쪽이 틀렸는지 알려주지
-- 않는다(이메일 존재 여부가 새지 않게).
CREATE OR REPLACE FUNCTION lookup_foreign_request(p_ref TEXT, p_email TEXT)
RETURNS TABLE (
  ref_code TEXT,
  status TEXT,
  lang TEXT,
  event_date DATE,
  group_size INTEGER,
  club_name TEXT,
  area TEXT,
  selected_menu_total INTEGER,
  created_at TIMESTAMPTZ,
  contact_type TEXT,
  contact_value TEXT,
  pass_token TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_ref   TEXT := upper(regexp_replace(COALESCE(p_ref, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF v_email = '' OR v_ref = '' THEN
    RETURN;
  END IF;
  -- "NF-A1B2C3" · "nfa1b2c3" · "a1b2c3" 전부 받는다. 접수번호 6자는 uuid hex라
  -- 'N'이 들어갈 수 없어서 접두 제거가 안전하다.
  IF left(v_ref, 2) = 'NF' THEN
    v_ref := substring(v_ref FROM 3);
  END IF;
  IF v_ref !~ '^[0-9A-F]{6}$' THEN
    RETURN;
  END IF;

  -- 레이트리밋 — 기록 전에 센다.
  IF (
    SELECT count(*) FROM foreign_lookup_attempts
    WHERE email = v_email AND created_at > now() - interval '1 minute'
  ) >= 10 THEN
    RAISE EXCEPTION 'lookup_rate_limited';
  END IF;
  INSERT INTO foreign_lookup_attempts (email) VALUES (v_email);
  DELETE FROM foreign_lookup_attempts WHERE created_at < now() - interval '1 day';

  RETURN QUERY
  SELECT
    fr.ref_code,
    fr.status,
    fr.lang,
    fr.event_date,
    fr.group_size,
    COALESCE(NULLIF(c.name_en, ''), c.name) AS club_name,
    c.area,
    fr.selected_menu_total,
    fr.created_at,
    fr.contact_type,
    fr.contact_value,
    bc.public_token AS pass_token
  FROM foreign_requests fr
  LEFT JOIN clubs c ON c.id = fr.club_ids[1]
  -- 확정서가 여러 번 발행될 수 있어 가장 최근 것만 본다.
  LEFT JOIN LATERAL (
    SELECT public_token FROM booking_confirmations
    WHERE request_id = fr.id ORDER BY created_at DESC LIMIT 1
  ) bc ON true
  WHERE upper(right(fr.ref_code, 6)) = v_ref
    AND (
      (fr.contact_type = 'email' AND lower(fr.contact_value) = v_email)
      OR lower(fr.backup_email) = v_email
    )
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_foreign_request(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION lookup_foreign_request(TEXT, TEXT) IS
  '비로그인 예약조회. 접수번호(NF-XXXXXX) + 이메일이 둘 다 맞을 때만 1행. 손님용 예약패스 토큰만 돌려준다(MD용 proposal_token은 제외).';

-- ── ⑤ 호출자 권한 확인용 (Edge Function 인증) ───────────────────────────────
-- foreign-guest-emails가 Bearer 키를 문자열로 비교하다가 401로 죽어 있었다
-- (Supabase가 함수에 주입하는 키 형식과 vault의 레거시 JWT가 다르다).
-- 키를 비교하는 대신 "이 키가 어떤 역할로 받아들여지는가"를 PostgREST에 묻는다.
-- 반환값은 역할 이름뿐이라 노출되는 정보가 없고, 권한 검사는 그대로 유지된다.
CREATE OR REPLACE FUNCTION caller_role()
RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;

GRANT EXECUTE ON FUNCTION caller_role() TO anon, authenticated, service_role;

COMMENT ON FUNCTION caller_role() IS
  '호출자가 어떤 DB 역할로 들어왔는지 반환(anon·authenticated·service_role). Edge Function이 service_role 호출인지 확인하는 용도(Migration 691).';
