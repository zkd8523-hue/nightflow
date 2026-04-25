-- Migration 127: phone_verifications.user_id 컬럼 추가
--
-- Context (2026-04-26):
--   MD 신청 폼에 SMS OTP 인증 도입. 본인 user_id 매칭으로 phone 도용 차단.
--   verify-otp 시 세션 user.id를 기록 → /api/md/apply에서 user_id 매칭 검증.
--
--   기존 signup 흐름은 user_id NULL로 기록 (하위 호환).

ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_user
  ON public.phone_verifications(user_id, verified_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.phone_verifications.user_id IS
  'verify-otp 시 인증한 세션 유저 ID. md_apply 등 인증 컨텍스트에서 본인 매칭에 사용. signup 흐름은 NULL.';
