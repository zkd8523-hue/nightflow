-- Fix the auto_create_club_on_md_approval function
-- The original migration had several issues:
-- 1. clubs table doesn't have md_id column
-- 2. clubs table doesn't have address_detail column
-- 3. area_enum doesn't exist (area is just TEXT)
-- This migration removes the broken INSERT and simplifies the function

DROP TRIGGER IF EXISTS trigger_auto_create_club ON users;
DROP FUNCTION IF EXISTS auto_create_club_on_md_approval();

-- New simplified version: just mark MD as approved, don't auto-create club
CREATE OR REPLACE FUNCTION auto_create_club_on_md_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- MD approval is now handled entirely by the trigger
  -- Club creation is done separately by Admin
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_create_club
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_club_on_md_approval();

COMMENT ON FUNCTION auto_create_club_on_md_approval IS 'Placeholder for MD approval trigger';
