-- Migration 317: 와글 채팅/SHOT 테스트 데이터 격리
-- - 작성자 users.is_test=true면 chat_messages/chat_shots에 자동으로 is_test=true 마킹
-- - 프로덕션 환경에선 클라이언트가 is_test=false 필터링 → 테스트 데이터 미노출
-- - dev/prod가 같은 Supabase를 공유하는 환경 대응

-- ============================================
-- 1) is_test 컬럼 추가
-- ============================================
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- 2) INSERT 트리거 — 작성자의 users.is_test 자동 복사
-- ============================================
CREATE OR REPLACE FUNCTION mark_chat_message_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE)
    INTO NEW.is_test
    FROM users u
    WHERE u.id = NEW.author_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_chat_message_is_test ON chat_messages;
CREATE TRIGGER trg_mark_chat_message_is_test
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION mark_chat_message_is_test();

CREATE OR REPLACE FUNCTION mark_chat_shot_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE)
    INTO NEW.is_test
    FROM users u
    WHERE u.id = NEW.author_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_chat_shot_is_test ON chat_shots;
CREATE TRIGGER trg_mark_chat_shot_is_test
  BEFORE INSERT ON chat_shots
  FOR EACH ROW EXECUTE FUNCTION mark_chat_shot_is_test();

-- ============================================
-- 3) 기존 row backfill — 이미 작성된 테스트 계정 메시지/SHOT 마킹
-- ============================================
UPDATE chat_messages
  SET is_test = TRUE
  WHERE author_id IN (SELECT id FROM users WHERE is_test = TRUE)
    AND is_test = FALSE;

UPDATE chat_shots
  SET is_test = TRUE
  WHERE author_id IN (SELECT id FROM users WHERE is_test = TRUE)
    AND is_test = FALSE;

-- ============================================
-- 4) 필터링 성능 인덱스 (room별 + is_test=false 활성 메시지 빠른 조회)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_real
  ON chat_messages(room, created_at DESC)
  WHERE is_test = FALSE AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_shots_area_real
  ON chat_shots(area, created_at DESC)
  WHERE is_test = FALSE;

COMMENT ON COLUMN chat_messages.is_test IS
  '테스트 계정(users.is_test=true) 메시지. 프로덕션 클라이언트에서 자동 제외.';
COMMENT ON COLUMN chat_shots.is_test IS
  '테스트 계정(users.is_test=true) SHOT. 프로덕션 클라이언트에서 자동 제외.';
