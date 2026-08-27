-- ============================================================================
-- Migration 578: 라인업 제보 이미지 버킷
--
-- 576에서 lineup_reports 테이블은 만들었지만 이미지를 둘 곳이 없었다.
-- 공개 버킷인 이유: 관리자 검토 화면에서 <img src>로 바로 띄워야 하고,
-- 어차피 클럽이 인스타에 공개한 포스터라 비공개로 둘 이유가 없다.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lineup-reports',
  'lineup-reports',
  true,
  10485760, -- 10MB. 인스타 스크린샷은 보통 1~3MB.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- 업로드: 로그인한 사람이 자기 폴더({uid}/...)에만.
-- 폴더를 uid로 가르는 이유 — 남의 제보 이미지를 덮어쓰거나 지울 수 없게 한다.
DROP POLICY IF EXISTS "lineup_reports_upload" ON storage.objects;
CREATE POLICY "lineup_reports_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lineup-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 조회: 공개 버킷이라 누구나. 관리자 화면이 바로 렌더할 수 있어야 한다.
DROP POLICY IF EXISTS "lineup_reports_read" ON storage.objects;
CREATE POLICY "lineup_reports_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'lineup-reports');

-- 삭제: 본인 것 또는 관리자(반려 후 정리)
DROP POLICY IF EXISTS "lineup_reports_delete" ON storage.objects;
CREATE POLICY "lineup_reports_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lineup-reports'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin())
  );
