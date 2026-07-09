-- ============================================================
-- Migration 432: 와글 답글 알림(인앱+푸시) + reply_count 트리거 복구
-- ------------------------------------------------------------
-- 배경:
--   - Migration 291의 트리거(sync_chat_reply_count, notify_chat_reply)가
--     live DB에서 동작하지 않음 (전체 메시지 reply_count=0, chat_reply 알림 0건).
--     291의 함수/트리거 블록이 수동 적용 과정에서 누락된 것으로 추정.
--   - 답글 알림도 "인앱 알림만" 설계였고 push는 아예 없었음.
-- 조치:
--   1) reply_count 동기화 트리거 재생성 (INSERT/UPDATE/DELETE)
--   2) 답글 알림 함수 재생성 → 인앱 알림 INSERT + notify_user_push(푸시) 둘 다
--   3) 기존 데이터 reply_count 백필
-- ============================================================

-- 1) reply_count 동기화 (291 원본 복구) --------------------------------
CREATE OR REPLACE FUNCTION sync_chat_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE chat_messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL THEN
    IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
      UPDATE chat_messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = NEW.parent_id;
    ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE THEN
      UPDATE chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_chat_reply_count ON chat_messages;
CREATE TRIGGER trg_sync_chat_reply_count
  AFTER INSERT OR UPDATE OR DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_chat_reply_count();

-- 2) 답글 알림: 인앱 + 푸시 --------------------------------------------
CREATE OR REPLACE FUNCTION notify_chat_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author UUID;
  v_replier_name TEXT;
  v_room TEXT;
  v_preview TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT author_id, room INTO v_parent_author, v_room
    FROM chat_messages WHERE id = NEW.parent_id;

  -- 본인 글에 본인 답글 → 알림 X
  IF v_parent_author IS NULL OR v_parent_author = NEW.author_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_replier_name FROM users WHERE id = NEW.author_id;

  v_preview := substring(COALESCE(NEW.content, ''), 1, 30);
  IF char_length(COALESCE(NEW.content, '')) > 30 THEN
    v_preview := v_preview || '...';
  ELSIF COALESCE(NEW.content, '') = '' THEN
    v_preview := '사진을 남겼어요';
  END IF;

  -- (a) 인앱 알림 (알림 목록에 노출) — action_url로 해당 스레드 이동
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_parent_author,
    'chat_reply',
    '내 와글에 답글이 달렸어요',
    COALESCE(v_replier_name, '익명') || ': ' || COALESCE(v_preview, ''),
    '/chat?reply=' || NEW.parent_id::text
  );

  -- (b) 푸시 알림 (카테고리 'chat' 토글/방해금지 준수)
  PERFORM notify_user_push(
    v_parent_author,
    '💬 ' || COALESCE(v_replier_name, '익명'),
    COALESCE(v_preview, ''),
    jsonb_build_object('type', 'chat_reply', 'parent_id', NEW.parent_id::text),
    '/chat?reply=' || NEW.parent_id::text,
    'chat'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_reply ON chat_messages;
CREATE TRIGGER trg_notify_chat_reply
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_reply();

-- 3) 기존 reply_count 백필 --------------------------------------------
UPDATE chat_messages p
  SET reply_count = COALESCE((
    SELECT COUNT(*) FROM chat_messages c
    WHERE c.parent_id = p.id AND c.is_deleted = FALSE
  ), 0)
  WHERE p.parent_id IS NULL;

COMMENT ON FUNCTION notify_chat_reply() IS
  'Migration 432: 답글 작성 시 부모 작성자에게 인앱 알림 + 푸시(category=chat). 본인 답글 제외.';
