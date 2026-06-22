-- Migration 284: 실시간 채팅 + GPS 지역 인증
--
-- 컨셉: 트위터식 채팅
--   - 채팅방: 전체 / 강남 / 홍대 / 이태원 / 다른 지역
--   - 읽기: 누구나 (비로그인 포함)
--   - 쓰기:
--     · 전체방 = 로그인만
--     · 지역방 = 로그인 + GPS 인증 (2시간 유효, 만료 10분 전 자동 갱신)
--   - 메시지 영구 보존
--   - GPS 좌표는 저장하지 않음, 지역 코드(area)만 저장

-- ============================================
-- 0) 헬퍼 함수 보강 (277과 중복돼도 안전, OR REPLACE)
--    279만 적용해도 작동하도록 보장
-- ============================================
CREATE OR REPLACE FUNCTION public.is_blocked_or_deleted(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND (is_blocked = TRUE OR deleted_at IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_or_deleted(UUID) TO authenticated;

-- is_admin은 109에서 정의됨. 없으면 만들고, 있으면 무시.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ============================================
-- 1) 지역 인증 (2시간 유효)
-- ============================================
CREATE TABLE IF NOT EXISTS area_verifications (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL
    CHECK (area IN ('gangnam', 'hongdae', 'itaewon', 'other')),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, area)
);

-- expires_at > now() 같은 STABLE 함수는 인덱스 predicate에 쓸 수 없으므로
-- partial 조건 없이 일반 인덱스로 생성. 쿼리에서 expires_at > now() 필터가
-- 인덱스를 그대로 활용함.
CREATE INDEX IF NOT EXISTS idx_area_verifications_active
  ON area_verifications(user_id, area, expires_at DESC);

ALTER TABLE area_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User can read own verifications" ON area_verifications;
CREATE POLICY "User can read own verifications"
  ON area_verifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can upsert own verification" ON area_verifications;
CREATE POLICY "User can upsert own verification"
  ON area_verifications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

DROP POLICY IF EXISTS "User can update own verification" ON area_verifications;
CREATE POLICY "User can update own verification"
  ON area_verifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can delete own verification" ON area_verifications;
CREATE POLICY "User can delete own verification"
  ON area_verifications
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 2) 헬퍼 함수: 사용자가 특정 지역에 현재 인증되어 있나
-- ============================================
CREATE OR REPLACE FUNCTION public.has_active_area_verification(
  p_user_id UUID,
  p_area TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM area_verifications
    WHERE user_id = p_user_id
      AND area = p_area
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_area_verification(UUID, TEXT)
  TO authenticated;

-- ============================================
-- 3) 채팅 메시지
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL
    CHECK (room IN ('all', 'gangnam', 'hongdae', 'itaewon', 'other')),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time
  ON chat_messages(room, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_messages_author
  ON chat_messages(author_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 (비로그인 포함, 트위터식)
DROP POLICY IF EXISTS "Anyone can read chat" ON chat_messages;
CREATE POLICY "Anyone can read chat"
  ON chat_messages
  FOR SELECT USING (is_deleted = FALSE);

-- 쓰기 정책: 전체방은 로그인만, 지역방은 GPS 인증 필요
DROP POLICY IF EXISTS "Verified users can write chat" ON chat_messages;
CREATE POLICY "Verified users can write chat"
  ON chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND (
      room = 'all'
      OR public.has_active_area_verification(auth.uid(), room)
    )
  );

-- 본인 메시지 삭제 가능
DROP POLICY IF EXISTS "Author or admin can delete chat" ON chat_messages;
CREATE POLICY "Author or admin can delete chat"
  ON chat_messages
  FOR DELETE
  USING (
    auth.uid() = author_id
    OR public.is_admin()
  );

-- ============================================
-- 4) 채팅 메시지 신고 (자정용)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (reason IN ('spam', 'abuse', 'advertising', 'other')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reports_pending
  ON chat_message_reports(status, created_at DESC) WHERE status = 'pending';

ALTER TABLE chat_message_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Login users can report chat" ON chat_message_reports;
CREATE POLICY "Login users can report chat"
  ON chat_message_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM chat_messages
      WHERE id = message_id AND author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "View own + admin chat reports" ON chat_message_reports;
CREATE POLICY "View own + admin chat reports"
  ON chat_message_reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can update chat reports" ON chat_message_reports;
CREATE POLICY "Admin can update chat reports"
  ON chat_message_reports
  FOR UPDATE
  USING (public.is_admin());

-- ============================================
-- 5) Realtime publication 등록
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END $$;

COMMENT ON TABLE chat_messages IS
  '실시간 채팅 메시지. 전체방=로그인, 지역방=GPS 인증 필요(2시간). 영구 보존, 트위터식.';
COMMENT ON TABLE area_verifications IS
  '유저별 지역 GPS 인증 (2시간 유효, 만료 10분 전 자동 갱신). 좌표 저장 없음, 지역 코드만.';
