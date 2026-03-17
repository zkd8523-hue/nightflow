-- Fix users table UPDATE policy to allow updating own profile fields
-- The current policy only has USING, not WITH CHECK, which causes issues with field updates

DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
