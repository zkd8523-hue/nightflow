-- 208: Club tags (filter + characteristic) and drink menu
-- Tags use prefix grouping: genre:, crowd:, space:, age:, entry:
-- Drink menu = image URL in club-menus storage bucket

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS drink_menu_url TEXT,
  ADD COLUMN IF NOT EXISTS drink_menu_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clubs_tags ON clubs USING GIN (tags);

-- Storage bucket for drink menus (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-menus', 'club-menus', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Public read club menus" ON storage.objects;
CREATE POLICY "Public read club menus" ON storage.objects
  FOR SELECT USING (bucket_id = 'club-menus');

-- Admin write
DROP POLICY IF EXISTS "Admin upload club menus" ON storage.objects;
CREATE POLICY "Admin upload club menus" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'club-menus'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin update club menus" ON storage.objects;
CREATE POLICY "Admin update club menus" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'club-menus'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin delete club menus" ON storage.objects;
CREATE POLICY "Admin delete club menus" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'club-menus'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
