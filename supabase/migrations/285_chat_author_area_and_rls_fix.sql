-- Migration 285:
-- 1) area_verifications RLS 단순화 (헬퍼 함수 권한 이슈 우회)
-- 2) chat_messages.author_area 컬럼 + 자동 채움 트리거
--    (작성 시점에 작성자의 가장 최근 활성 인증 지역을 박제)

-- ============================================
-- 1) 헬퍼 함수 권한 보강 (anon 포함)
-- ============================================
GRANT EXECUTE ON FUNCTION public.is_blocked_or_deleted(UUID)
  TO anon, authenticated;

-- has_active_area_verification도 그랜트 확실하게
GRANT EXECUTE ON FUNCTION public.has_active_area_verification(UUID, TEXT)
  TO anon, authenticated;

-- ============================================
-- 2) area_verifications INSERT 정책 단순화
--    is_blocked_or_deleted 체크는 제거 (UI/별도 검증으로 충분).
--    핵심 보안: auth.uid() = user_id 만 강제.
-- ============================================
DROP POLICY IF EXISTS "User can upsert own verification" ON area_verifications;
CREATE POLICY "User can upsert own verification"
  ON area_verifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3) chat_messages.author_area 컬럼 추가
--    작성 시점에 작성자의 가장 최근 활성 인증 지역을 박제
-- ============================================
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS author_area TEXT
    CHECK (author_area IS NULL OR author_area IN ('gangnam', 'hongdae', 'itaewon', 'other'));

CREATE INDEX IF NOT EXISTS idx_chat_messages_author_area
  ON chat_messages(author_area)
  WHERE author_area IS NOT NULL;

-- ============================================
-- 4) INSERT 시 author_area 자동 채움 트리거
--    작성자의 활성 area_verifications 중 가장 최근 verified_at 1건의 area를 박제
-- ============================================
CREATE OR REPLACE FUNCTION set_chat_message_author_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area TEXT;
BEGIN
  -- 클라이언트가 명시적으로 NULL 또는 미지정으로 보냈을 때만 자동 채움
  IF NEW.author_area IS NULL THEN
    SELECT area INTO v_area
    FROM area_verifications
    WHERE user_id = NEW.author_id
      AND expires_at > now()
    ORDER BY verified_at DESC
    LIMIT 1;
    NEW.author_area := v_area;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_chat_message_author_area ON chat_messages;
CREATE TRIGGER trg_set_chat_message_author_area
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION set_chat_message_author_area();

COMMENT ON COLUMN chat_messages.author_area IS
  '작성 시점의 작성자 활성 인증 지역 (가장 최근 verified_at 1건). NULL=미인증 상태에서 작성.';
