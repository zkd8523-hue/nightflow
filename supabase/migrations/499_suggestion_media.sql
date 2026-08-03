-- Migration 499: 건의 게시판 사진/동영상 첨부
-- - suggestions.media JSONB: [{type:'image'|'video', url, width?, height?, duration?}] 최대 4개
-- - Storage 버킷 suggestion-media: 이미지 5MB, 동영상 100MB / 60초 (길이는 클라 검증)
-- - 287_chat_media.sql 과 동일 패턴. 단, content 최소 5자 요건은 그대로 둔다 —
--   건의는 채팅과 달리 사진만으론 안 되고 설명 텍스트가 항상 있어야 하는 게 맞다는 판단.

-- ============================================
-- 1) suggestions.media 컬럼
-- ============================================
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE suggestions
  DROP CONSTRAINT IF EXISTS suggestions_media_check;
ALTER TABLE suggestions
  ADD CONSTRAINT suggestions_media_check
  CHECK (
    jsonb_typeof(media) = 'array'
    AND jsonb_array_length(media) <= 4
  );

COMMENT ON COLUMN suggestions.media IS
  '첨부 미디어 배열 (최대 4개). [{type:image|video, url, width?, height?, duration?}]';

-- ============================================
-- 2) Storage 버킷: suggestion-media (이미지+동영상)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'suggestion-media',
  'suggestion-media',
  true,
  104857600, -- 100MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 누구나 읽기 (목록/상세 공개글은 비로그인도 봄 — chat-media와 동일 공개 정책)
DROP POLICY IF EXISTS "Public read suggestion media" ON storage.objects;
CREATE POLICY "Public read suggestion media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'suggestion-media');

-- 로그인 유저 업로드
DROP POLICY IF EXISTS "Authenticated upload suggestion media" ON storage.objects;
CREATE POLICY "Authenticated upload suggestion media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'suggestion-media');

-- 본인 폴더만 수정/삭제 (경로 패턴: suggestion-media/{auth.uid()}/...)
DROP POLICY IF EXISTS "Owner update suggestion media" ON storage.objects;
CREATE POLICY "Owner update suggestion media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'suggestion-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owner delete suggestion media" ON storage.objects;
CREATE POLICY "Owner delete suggestion media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'suggestion-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
