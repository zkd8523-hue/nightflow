-- Admin이 users 테이블을 업데이트할 수 있도록 RLS 정책 추가
-- 문제: MD 승인 시 Admin의 UPDATE가 RLS에 의해 차단됨 (기존: auth.uid() = id 본인만 가능)
-- 해결: Admin role을 가진 유저는 모든 유저 레코드를 UPDATE 가능

-- Admin UPDATE 정책 (이미 존재 시 건너뜀)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update users' AND tablename = 'users'
  ) THEN
    CREATE POLICY "Admins can update users" ON users
      FOR UPDATE
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- 반려 사유 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_rejection_reason TEXT;
