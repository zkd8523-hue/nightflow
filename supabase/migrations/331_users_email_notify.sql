-- ============================================
-- users 테이블에 email + email_bounced 컬럼 추가
-- 외국인 이메일 알림(첫 오퍼/수락/리마인더) 발송용
--
-- 배경: public.users에는 email이 없고 auth.users.email에만 존재.
--       외국인은 카카오 알림톡을 못 쓰므로 이메일이 유일한 재접촉 채널.
--       Edge Function에서 바로 읽도록 public.users에 비정규화 저장.
--
-- 소프트 검증: 형식검증 + Resend bounce 웹훅으로 email_bounced 마킹.
--   bounce 감지 시 다음 방문에서 재입력 유도(앱/웹 UI에서 처리).
-- ============================================

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN email TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN email_bounced BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN users.email IS '알림용 이메일(외국인 우선). 가입 시 auth.users.email 복사 또는 폴백 입력값.';
COMMENT ON COLUMN users.email_bounced IS 'Resend bounce 웹훅으로 도달 불가 감지 시 true. 다음 방문에서 재입력 유도.';

-- 발송 대상 조회용 부분 인덱스 (외국인 + 유효 이메일)
CREATE INDEX IF NOT EXISTS idx_users_email_notify
  ON users (id)
  WHERE email IS NOT NULL AND email_bounced = false;
