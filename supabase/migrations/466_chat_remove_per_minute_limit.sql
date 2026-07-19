-- Migration 466: 와글 분당 글수 제한(분당 5건) 제거
-- 배경:
--   - 와글이 카톡식 실시간 채팅 UX로 바뀌며 연속 발화가 자연스러워짐.
--   - "1분에 5개까지만 보낼 수 있어요"가 정상 대화를 끊어 응답성을 해침.
-- 변경:
--   - 분당 카운트 제한 블록 제거.
--   - 1시간 내 같은 텍스트 중복 차단은 유지 (순수 도배/봇 방지).

CREATE OR REPLACE FUNCTION enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_duplicate INTEGER;
BEGIN
  -- 1시간 내 같은 텍스트 중복만 차단 (분당 글수 제한은 제거)
  IF char_length(NEW.content) > 0 THEN
    SELECT COUNT(*) INTO v_recent_duplicate
      FROM chat_messages
      WHERE author_id = NEW.author_id
        AND is_deleted = FALSE
        AND created_at >= NEW.created_at - INTERVAL '1 hour'
        AND trim(content) = trim(NEW.content);

    IF v_recent_duplicate > 0 THEN
      RAISE EXCEPTION 'RATE_LIMIT_DUPLICATE: 1시간 이내 같은 내용은 보낼 수 없어요'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_chat_rate_limit() IS
  '와글 도배 방지 (Migration 466): 1시간 내 같은 텍스트 중복만 차단. 분당 글수 제한 제거(카톡식 실시간 UX).';
