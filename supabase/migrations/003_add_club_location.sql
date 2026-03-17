-- ================================
-- 003: Add Club Location & MD Ownership
-- ================================

-- 1. Add md_id column to clubs table (owner of the club)
ALTER TABLE clubs
ADD COLUMN md_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add geolocation columns
ALTER TABLE clubs
ADD COLUMN latitude DECIMAL(10, 8),
ADD COLUMN longitude DECIMAL(11, 8),
ADD COLUMN address_detail TEXT,
ADD COLUMN postal_code TEXT,
ADD COLUMN phone TEXT;

-- 3. Create index for faster MD club queries
CREATE INDEX idx_clubs_md_id ON clubs(md_id);
CREATE INDEX idx_clubs_coordinates ON clubs(latitude, longitude);

-- 4. Enable RLS on clubs table (already enabled, adding policies)
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read clubs" ON clubs;
DROP POLICY IF EXISTS "MD can create own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can update own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can delete own clubs" ON clubs;

-- New policies
-- Everyone can read all clubs (for auction display)
CREATE POLICY "Anyone can read clubs" ON clubs
  FOR SELECT USING (true);

-- Approved MDs can create their own clubs
CREATE POLICY "MD can create own clubs" ON clubs
  FOR INSERT WITH CHECK (
    auth.uid() = md_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'md'
      AND md_status = 'approved'
    )
  );

-- MDs can update their own clubs
CREATE POLICY "MD can update own clubs" ON clubs
  FOR UPDATE USING (
    auth.uid() = md_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'md'
    )
  );

-- MDs can delete their own clubs
CREATE POLICY "MD can delete own clubs" ON clubs
  FOR DELETE USING (
    auth.uid() = md_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'md'
    )
  );

-- 5. Add comments for documentation
COMMENT ON COLUMN clubs.md_id IS 'MD who owns and manages this club';
COMMENT ON COLUMN clubs.latitude IS 'Latitude from Kakao Maps Geocoder API';
COMMENT ON COLUMN clubs.longitude IS 'Longitude from Kakao Maps Geocoder API';
COMMENT ON COLUMN clubs.address_detail IS 'Detailed address (floor, unit number, etc.)';
COMMENT ON COLUMN clubs.postal_code IS 'Postal code from Daum Postcode API';
COMMENT ON COLUMN clubs.phone IS 'Club contact phone number';
