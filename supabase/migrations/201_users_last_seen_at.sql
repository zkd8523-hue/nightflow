-- Migration 201: users.last_seen_at — 방장 활동성 트러스트 시그널
-- 깃발 라이프사이클(2-3주)에 맞춰 24시간/3일/7일 버킷으로 표시
-- 7일 초과는 표시하지 않음 (부정 시그널 방지)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC);

-- 클라이언트에서 호출하는 RPC. 1시간 throttle은 클라이언트에서 처리.
-- 서버 측에서는 인증된 사용자가 본인 last_seen_at만 갱신 가능하도록 함.
CREATE OR REPLACE FUNCTION touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE users SET last_seen_at = now() WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION touch_last_seen() TO authenticated;
