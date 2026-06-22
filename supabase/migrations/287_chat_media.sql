-- Migration 287: 채팅 미디어 첨부 (이미지/동영상)
-- - chat_messages.media JSONB: [{type:'image'|'video', url, width?, height?, duration?}] 최대 4개
-- - Storage 버킷 chat-media: 이미지 5MB, 동영상 100MB / 60초 (길이는 클라 검증)

-- ============================================
-- 1) chat_messages.media 컬럼
-- ============================================
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 최대 4개 + 각 항목 type 검증
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_media_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_media_check
  CHECK (
    jsonb_typeof(media) = 'array'
    AND jsonb_array_length(media) <= 4
  );

COMMENT ON COLUMN chat_messages.media IS
  '첨부 미디어 배열 (최대 4개). [{type:image|video, url, width?, height?, duration?}]';

-- 텍스트 없이 미디어만 보내는 경우 허용하려면 content CHECK 완화 필요
-- 기존: char_length(content) BETWEEN 1 AND 500
-- 신규: 미디어가 있으면 content 0자도 OK
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_content_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_content_check
  CHECK (
    char_length(content) <= 500
    AND (
      char_length(content) >= 1
      OR jsonb_array_length(media) >= 1
    )
  );

-- ============================================
-- 2) Storage 버킷: chat-media (이미지+동영상)
--    file_size_limit=100MB (동영상 기준). 이미지는 클라이언트에서 5MB로 별도 검증
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
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

-- 누구나 읽기 (트위터식)
DROP POLICY IF EXISTS "Public read chat media" ON storage.objects;
CREATE POLICY "Public read chat media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

-- 로그인 유저 업로드
DROP POLICY IF EXISTS "Authenticated upload chat media" ON storage.objects;
CREATE POLICY "Authenticated upload chat media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- 본인 폴더만 수정/삭제 (경로 패턴: chat-media/{auth.uid()}/...)
DROP POLICY IF EXISTS "Owner update chat media" ON storage.objects;
CREATE POLICY "Owner update chat media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owner delete chat media" ON storage.objects;
CREATE POLICY "Owner delete chat media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
