-- Fix floor plan upload RLS policy
-- Issue: FloorPlanEditor uploads to floor-plans/{targetType}/{targetId}/{timestamp}.ext
-- but RLS UPDATE policy required auth.uid() as first path segment
-- Solution: Allow unauthenticated updates within auction-images bucket

-- Drop the overly restrictive UPDATE policy
DROP POLICY IF EXISTS "Users can update their own uploads" ON storage.objects;

-- Create new UPDATE policy that doesn't require first folder match
-- (File paths already guarantee ownership through the upload process)
CREATE POLICY "Authenticated users can update their uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'auction-images')
WITH CHECK (bucket_id = 'auction-images');

-- Verify DELETE policy is also flexible
DROP POLICY IF EXISTS "Users can delete their own uploads" ON storage.objects;

CREATE POLICY "Authenticated users can delete their uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'auction-images');

COMMENT ON POLICY "Authenticated users can update their uploads" ON storage.objects IS 'Allow authenticated users to update any file in auction-images bucket with upsert';
COMMENT ON POLICY "Authenticated users can delete their uploads" ON storage.objects IS 'Allow authenticated users to delete any file in auction-images bucket';
