-- NightFlow Pass (Subscription) Schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_type TEXT; -- 'basic', 'premium'
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_waiver_count INTEGER DEFAULT 0;

-- Pass status helper function
CREATE OR REPLACE FUNCTION has_active_pass(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND pass_expires_at > now()
  );
$$ LANGUAGE sql STABLE;
