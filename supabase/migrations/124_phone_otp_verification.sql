-- Migration 124: SMS OTP 본인인증 + users.phone UNIQUE
--
-- Context (2026-04-23):
--   PortOne PASS 본인인증 반려 이후 대체 중복 차단 수단으로 SMS OTP 도입.
--   한국 통신사 실명제 전제로 phone 번호를 1인 1계정 강제 키로 사용.
--   기존 유저는 grandfather-in (재인증 강제 X), 신규 가입만 OTP 필수.
--
-- 전제 검증:
--   - public.users 내 phone 중복 0건 확인됨 (Supabase SQL Editor, 2026-04-23)
--   - deleted_at IS NOT NULL 유저 0건 → 탈퇴 후 재가입 정책과 충돌 없음

-- ============================================================
-- 1. phone_verifications: OTP 발송 기록 (rate limit + 검증용)
-- ============================================================
CREATE TABLE public.phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,             -- 숫자만 (01012345678)
  code_hash TEXT NOT NULL,         -- bcrypt/sha256 해시된 6자리 코드
  attempts INT NOT NULL DEFAULT 0, -- 오입력 횟수 (5회 초과 시 무효)
  verified_at TIMESTAMPTZ,         -- 인증 성공 시각
  expires_at TIMESTAMPTZ NOT NULL, -- 기본 3분 후
  ip TEXT,                         -- rate limit 추적용
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_phone_verifications_phone_created
  ON public.phone_verifications(phone, created_at DESC);

CREATE INDEX idx_phone_verifications_ip_created
  ON public.phone_verifications(ip, created_at DESC)
  WHERE ip IS NOT NULL;

CREATE INDEX idx_phone_verifications_expires
  ON public.phone_verifications(expires_at);

-- RLS: service_role만 접근 (API 라우트에서만 사용)
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = anon/authenticated 전부 차단

COMMENT ON TABLE public.phone_verifications IS
  'SMS OTP 인증 기록. 발송 rate limit과 코드 검증에 사용. 24시간 지나면 자동 정리.';

-- ============================================================
-- 2. users.phone UNIQUE (탈퇴 유저 제외)
-- ============================================================
CREATE UNIQUE INDEX idx_users_unique_phone
  ON public.users(phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_users_unique_phone IS
  '1인 1계정 강제. 탈퇴 계정(deleted_at IS NOT NULL)은 제외되어 30일 유예 중 재가입 허용.';

-- ============================================================
-- 3. Rate limit 체크 함수 (API에서 호출)
-- ============================================================
-- 정책:
--   - phone당 1분 내 1회 (재발송 쿨다운)
--   - phone당 24시간 내 5회 (하루 한도)
--   - IP당 10분 내 3회 (IP 남용 방지)
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(
  p_phone TEXT,
  p_ip TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_1min INT;
  v_phone_24h INT;
  v_ip_10min INT;
BEGIN
  SELECT COUNT(*) INTO v_phone_1min
  FROM public.phone_verifications
  WHERE phone = p_phone
    AND created_at > now() - INTERVAL '1 minute';

  IF v_phone_1min >= 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'phone_cooldown',
      'retry_after_sec', 60
    );
  END IF;

  SELECT COUNT(*) INTO v_phone_24h
  FROM public.phone_verifications
  WHERE phone = p_phone
    AND created_at > now() - INTERVAL '24 hours';

  IF v_phone_24h >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'phone_daily_limit'
    );
  END IF;

  IF p_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_ip_10min
    FROM public.phone_verifications
    WHERE ip = p_ip
      AND created_at > now() - INTERVAL '10 minutes';

    IF v_ip_10min >= 3 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'ip_limit'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_otp_rate_limit(TEXT, TEXT) TO service_role;

-- ============================================================
-- 4. 자동 정리 함수 (Cron에서 호출 권장)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_phone_verifications()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.phone_verifications
  WHERE created_at < now() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_phone_verifications() TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_phone_verifications() IS
  '24시간 경과 phone_verifications 삭제. pg_cron 또는 Edge Function으로 일 1회 호출 권장.';

-- ============================================================
-- 5. 가입 시 phone OTP 검증 트리거
-- ============================================================
-- 신규 users INSERT 시 phone이 지정됐으면 최근 10분 내에 OTP 인증된 기록이 있어야 통과.
-- RLS 무관하게 실행되도록 SECURITY DEFINER 로 설정.
-- UI 우회(직접 INSERT) 시에도 phone 도용 차단.
CREATE OR REPLACE FUNCTION public.validate_phone_otp_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.phone_verifications
    WHERE phone = NEW.phone
      AND verified_at IS NOT NULL
      AND verified_at > now() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'phone_not_verified'
      USING HINT = 'SMS 인증번호를 먼저 완료한 뒤 가입해주세요.',
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_phone_otp_on_signup
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_phone_otp_on_signup();

COMMENT ON TRIGGER enforce_phone_otp_on_signup ON public.users IS
  'phone OTP 인증 후 10분 이내에만 가입 허용. 도용·스팸 계정 차단.';
