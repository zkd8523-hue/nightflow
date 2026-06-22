-- Migration 315: 와글 SHOT — 현장 인증 기반 휘발성 미디어
-- - 옵션 B: 작성은 지역 인증된 사람만, 노출은 잡담방 + 지역방 둘 다
-- - 9시간 휘발성 (expires_at 컬럼)
-- - 이미지 1장 or 짧은 동영상 1개
-- - 작성자 인센티브(도달 극대화) + 현장 진정성(인증) 둘 다 살림

CREATE TABLE IF NOT EXISTS chat_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL
    CHECK (area IN ('gangnam', 'hongdae', 'itaewon')),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration NUMERIC,
  caption TEXT CHECK (caption IS NULL OR char_length(caption) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '9 hours'
);

-- 활성 SHOT 조회용 (지역별 최신순)
-- 주: WHERE expires_at > now() 같은 partial 조건은 now()가 IMMUTABLE이 아니라 불가능.
--     쿼리에서 expires_at 필터링하면 인덱스 활용됨
CREATE INDEX IF NOT EXISTS idx_chat_shots_active
  ON chat_shots(area, created_at DESC);

-- cron 만료 정리용
CREATE INDEX IF NOT EXISTS idx_chat_shots_expires
  ON chat_shots(expires_at);

-- 작성자 본인 SHOT 조회 (프로필 등)
CREATE INDEX IF NOT EXISTS idx_chat_shots_author
  ON chat_shots(author_id, created_at DESC);

ALTER TABLE chat_shots ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 (비로그인 포함, 만료 안 된 것만)
DROP POLICY IF EXISTS "Anyone can read active shots" ON chat_shots;
CREATE POLICY "Anyone can read active shots"
  ON chat_shots
  FOR SELECT USING (expires_at > now());

-- 작성: 본인 + 해당 area 인증 보유 + is_blocked 아님
DROP POLICY IF EXISTS "Verified users can post shots" ON chat_shots;
CREATE POLICY "Verified users can post shots"
  ON chat_shots
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND public.has_active_area_verification(auth.uid(), area)
  );

-- 본인 SHOT 삭제 가능 (admin도)
DROP POLICY IF EXISTS "Author or admin can delete shots" ON chat_shots;
CREATE POLICY "Author or admin can delete shots"
  ON chat_shots
  FOR DELETE USING (
    auth.uid() = author_id
    OR public.is_admin()
  );

-- Realtime 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_shots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_shots;
  END IF;
END $$;

COMMENT ON TABLE chat_shots IS
  '와글 SHOT — 현장 인증된 유저의 휘발성 미디어 (9시간). 지역방 + 잡담방 모두 노출.';
COMMENT ON COLUMN chat_shots.expires_at IS
  '만료 시각. INSERT 시 created_at + 9h로 자동 설정. 만료된 row는 RLS SELECT에서 제외 + cron 정리.';
