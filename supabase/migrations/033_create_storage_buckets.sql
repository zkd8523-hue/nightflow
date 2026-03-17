-- Create auction-images storage bucket for MD verification photos, floor plans, and auction images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'auction-images',
  'auction-images',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read access to auction images
CREATE POLICY "Public read access to auction images"
ON storage.objects FOR SELECT
USING (bucket_id = 'auction-images');

-- Authenticated users can upload auction images
CREATE POLICY "Authenticated users can upload auction images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'auction-images');

-- Users can update their own uploads
CREATE POLICY "Users can update their own uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'auction-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'auction-images' AND auth.uid()::text = (storage.foldername(name))[1]);
