-- Migration 078: Referral 추적 시스템
-- 공유 링크를 통한 바이럴 추적 (유저에게 보이지 않는 백그라운드 처리)

-- 1) users 테이블 컬럼 추가
ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN signup_source TEXT;

-- 2) 인덱스
CREATE INDEX idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;

-- 3) referral_code 자동 생성 함수 (8자리, 혼동 문자 제외: 0/O/1/I)
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4) INSERT 트리거 (가입 시 referral_code 자동 부여)
CREATE OR REPLACE FUNCTION set_referral_code_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  retries INTEGER := 0;
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      new_code := generate_referral_code();
      -- 중복 확인
      IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = new_code) THEN
        NEW.referral_code := new_code;
        EXIT;
      END IF;
      retries := retries + 1;
      IF retries > 10 THEN
        RAISE EXCEPTION 'Referral code generation failed after 10 retries';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_referral_code_on_insert();

-- 5) 기존 유저 일괄 코드 부여
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  retries INTEGER;
BEGIN
  FOR r IN SELECT id FROM users WHERE referral_code IS NULL AND deleted_at IS NULL LOOP
    retries := 0;
    LOOP
      new_code := generate_referral_code();
      IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = new_code) THEN
        UPDATE users SET referral_code = new_code WHERE id = r.id;
        EXIT;
      END IF;
      retries := retries + 1;
      IF retries > 10 THEN
        RAISE EXCEPTION 'Code generation failed for user %', r.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;
