-- ============================================================================
-- Migration 584: DJ 프로필 편집 RPC + 사진 스토리지
-- 선행: 583(djs.claimed_by_user_id, dj_claims)
--
-- ⚠️ djs의 UPDATE 정책을 열지 않는다. Postgres RLS는 행 단위지 컬럼 단위가
-- 아니라서 "본인 소유 DJ면 UPDATE 허용"을 열면 slug(SEO URL)·deleted_at
-- (자기 이름 삭제)·resident_club_id·claimed_by_user_id(소유권 이전)까지 전부
-- 그 유저가 바꿀 수 있게 된다. UPDATE 정책의 WITH CHECK는 NEW만 보므로
-- 컬럼 화이트리스트를 RLS로 표현할 수 없다 — 이 RPC가 유일한 편집 경로다.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_dj_profile(
  p_bio TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL,
  p_soundcloud_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_dj_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT id INTO v_dj_id FROM djs WHERE claimed_by_user_id = v_uid;
  IF v_dj_id IS NULL THEN
    RAISE EXCEPTION '인증된 DJ 프로필이 없습니다';
  END IF;

  IF p_bio IS NOT NULL AND length(p_bio) > 500 THEN
    RAISE EXCEPTION '소개는 500자 이내로 입력해주세요';
  END IF;

  -- 우리 스토리지 경로만 허용 — 외부 URL은 추적 픽셀/hotlink 우려
  IF p_photo_url IS NOT NULL AND p_photo_url !~ '^https://[a-z0-9.-]+\.supabase\.co/storage/v1/object/public/dj-photos/' THEN
    RAISE EXCEPTION '허용되지 않은 이미지 경로입니다';
  END IF;

  IF p_soundcloud_url IS NOT NULL AND p_soundcloud_url !~ '^https://(www\.)?soundcloud\.com/[A-Za-z0-9_-]+/?.*$' THEN
    RAISE EXCEPTION '사운드클라우드 URL 형식이 올바르지 않습니다';
  END IF;

  UPDATE djs
  SET
    bio = COALESCE(NULLIF(trim(p_bio), ''), bio),
    photo_url = COALESCE(p_photo_url, photo_url),
    soundcloud_url = COALESCE(NULLIF(trim(p_soundcloud_url), ''), soundcloud_url)
  WHERE id = v_dj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION update_dj_profile(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION update_dj_profile IS
  'DJ 본인 프로필 편집 유일 경로. display_name/instagram은 허용 안 함(dj_aliases 매칭 체계 + 인증 근거값 보호).';

-- ============================================================================
-- 스토리지 버킷 — 578(lineup-reports) 패턴
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dj-photos',
  'dj-photos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- 경로는 {auth.uid()}/... (dj_id가 아니라 uid — 소유권이 바뀌어도 정책이 안 꼬인다)
DROP POLICY IF EXISTS "dj_photos_upload" ON storage.objects;
CREATE POLICY "dj_photos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dj-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "dj_photos_read" ON storage.objects;
CREATE POLICY "dj_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dj-photos');

DROP POLICY IF EXISTS "dj_photos_delete" ON storage.objects;
CREATE POLICY "dj_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dj-photos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin())
  );
