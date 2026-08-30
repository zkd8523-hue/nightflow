-- Migration 615: 회원가입 전화번호 SMS OTP 인증 제거
--
-- 배경 (2026-08-30):
--   Migration 124가 도입한 SMS OTP는 PortOne PASS 반려 이후 "중복가입 차단"이
--   목적이었다. 깃발(puzzles 역경매) 폐기로 그 효용이 크게 줄었고, 안 쓰는
--   전화번호를 필수로 받는 현재 구조가 오히려 개인정보보호법 제16조
--   (최소수집 원칙) 위반 리스크로 이어질 수 있다.
--
--   법적 검토: 청소년보호법상 연령확인 의무는 업주/종사자 대상이며 정보
--   제공 플랫폼에는 적용되지 않고, 민간 본인확인제는 헌재 2012.8.23.
--   2010헌마47·252(병합)로 위헌 결정되어 삭제됨. 상세 근거는
--   .claude/plans/moonlit-hopping-whisper.md 참조.
--
-- 결정: 번호 자체를 받지 않는다. 생년월일·성별 게이트는 유지.
--   MD도 OTP는 제거하되 번호 입력(자기신고)은 유지 — tel: 링크·승인
--   알림톡에 실사용 중이므로. 일반 유저 phone은 파기, MD는 보존.
--
-- ⚠️ 적용 순서 중요: 이 마이그레이션을 먼저 적용한 뒤 코드를 배포할 것.
--   트리거가 살아있는 상태에서 OTP 없는 코드가 배포되면 phone이 있는
--   모든 INSERT(MD 지원 포함)가 phone_not_verified로 실패한다.
-- ============================================================

-- 1) OTP 트리거·함수 전부 제거
DROP TRIGGER IF EXISTS enforce_phone_otp_on_signup ON public.users;
DROP FUNCTION IF EXISTS public.validate_phone_otp_on_signup();
DROP FUNCTION IF EXISTS public.check_otp_rate_limit(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cleanup_expired_phone_verifications();

-- 2) phone_verifications 삭제 (OTP 완전 폐기, 개인정보 보관 테이블이므로 파기가 곧 제21조 이행)
DROP TABLE IF EXISTS public.phone_verifications;

-- 3) idx_users_unique_phone(473)은 그대로 유지 — 번호가 자기신고가 되어도
--    같은 번호로 여러 계정을 만드는 것은 계속 막는다.

-- 4) 일반 유저 phone 파기 (개인정보보호법 제21조 — MD는 tel: 링크·승인 알림톡에
--    실사용 중이므로 보존)
UPDATE public.users
SET phone = NULL
WHERE role <> 'md' AND phone IS NOT NULL;

-- 5) 마케팅 동의 정리 — 발송 수단(SMS/알림톡)이 없어진 동의는 해제
UPDATE public.users
SET alimtalk_consent = FALSE, alimtalk_consent_at = NULL
WHERE role <> 'md' AND alimtalk_consent = TRUE;

-- 6) signup_funnel 뷰 재정의 — signup_phone_verified 이벤트가 더 이상 발생하지
--    않으므로 4단계 → 3단계로 축소 (시작 → 약관동의 → 완료)
--    ⚠️ 컬럼이 줄어들어 CREATE OR REPLACE 불가 (42P16) → DROP 후 재생성 필요
DROP VIEW IF EXISTS signup_funnel;

CREATE VIEW signup_funnel
WITH (security_invoker = true) AS
WITH stages AS (
  SELECT
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_start') AS step1_start,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_agree') AS step2_agree,
    COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'signup_completed') AS step3_completed
  FROM user_events
  WHERE created_at >= now() - INTERVAL '7 days'
)
SELECT
  step1_start,
  step2_agree,
  step3_completed,
  ROUND(100.0 * step2_agree / NULLIF(step1_start, 0), 1) AS agree_rate,
  ROUND(100.0 * step3_completed / NULLIF(step2_agree, 0), 1) AS complete_rate,
  ROUND(100.0 * step3_completed / NULLIF(step1_start, 0), 1) AS overall_rate
FROM stages;
