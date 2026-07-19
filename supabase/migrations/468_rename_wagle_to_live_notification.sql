-- ============================================================================
-- Migration 468: 답글 알림 문구 '와글' → 'LIVE' (명칭 통일)
-- 배경:
--   앱 내 사용자 노출 명칭을 '와글' → 'LIVE'로 통일했는데(탭 라벨/CTA/엔드카드),
--   답글 알림 제목만 '내 와글에 답글이 달렸어요'로 남아 유저에게 옛 명칭이 노출됨.
-- 변경:
--   Migration 432의 notify_chat_reply()를 그대로 유지하되 인앱 알림 title만 교체.
--   (트리거 재생성 불필요 — CREATE OR REPLACE로 함수 본문만 갱신)
-- 적용: Supabase 대시보드 SQL Editor에 통째로 1회 실행. db push 금지.
-- ============================================================================

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
    '내 LIVE에 답글이 달렸어요',   -- ← '와글' → 'LIVE'
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

COMMENT ON FUNCTION notify_chat_reply() IS
  'LIVE(구 와글) 답글 알림: 인앱 + 푸시. Migration 468에서 문구를 LIVE로 통일.';
