-- Migration 288: 와글 채팅 도배 방지
-- - 메시지 간격: 같은 유저 직전 메시지로부터 5초 이내 거부
-- - 분당 최대: 같은 유저 최근 60초간 10개 초과 거부
-- - 연속 중복: 같은 유저 직전 메시지와 본문 동일 시 거부
-- - 신고 누적: 같은 유저 메시지에 대한 신고 5건 누적 시 24h 자동 정지

-- ============================================
-- 1) 채팅 도배 방지 트리거
-- ============================================
CREATE OR REPLACE FUNCTION enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_msg RECORD;
  v_minute_count INTEGER;
BEGIN
  -- 작성자의 가장 최근 메시지(삭제되지 않은 것) 1건 조회
  SELECT id, content, created_at
    INTO v_last_msg
    FROM chat_messages
    WHERE author_id = NEW.author_id
      AND is_deleted = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

  IF FOUND THEN
    -- 5초 간격
    IF NEW.created_at - v_last_msg.created_at < INTERVAL '5 seconds' THEN
      RAISE EXCEPTION 'RATE_LIMIT_INTERVAL: 5초 후에 다시 시도해주세요'
        USING ERRCODE = 'P0001';
    END IF;

    -- 연속 중복 차단 (직전 메시지와 본문 동일)
    IF trim(v_last_msg.content) = trim(NEW.content)
       AND char_length(NEW.content) > 0 THEN
      RAISE EXCEPTION 'RATE_LIMIT_DUPLICATE: 직전과 같은 내용은 보낼 수 없어요'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 분당 10개 제한 (직전 60초 내)
  SELECT COUNT(*) INTO v_minute_count
    FROM chat_messages
    WHERE author_id = NEW.author_id
      AND is_deleted = FALSE
      AND created_at >= NEW.created_at - INTERVAL '60 seconds';

  IF v_minute_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT_PER_MINUTE: 1분에 10개까지만 보낼 수 있어요'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_rate_limit ON chat_messages;
CREATE TRIGGER trg_chat_rate_limit
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION enforce_chat_rate_limit();

COMMENT ON FUNCTION enforce_chat_rate_limit() IS
  '와글 도배 방지: 5초 간격, 분당 10개, 연속 중복 차단';

-- ============================================
-- 2) 신고 누적 5건 → 작성자 24h 자동 정지
-- ============================================
CREATE OR REPLACE FUNCTION enforce_chat_report_auto_suspend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id UUID;
  v_distinct_reporters INTEGER;
  v_new_block_until TIMESTAMPTZ;
BEGIN
  -- 신고 대상 메시지의 작성자 조회
  SELECT author_id INTO v_author_id
    FROM chat_messages
    WHERE id = NEW.message_id;

  IF v_author_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 해당 메시지에 대한 distinct 신고자 수
  SELECT COUNT(DISTINCT reporter_id) INTO v_distinct_reporters
    FROM chat_message_reports
    WHERE message_id = NEW.message_id;

  -- 5건 미만이면 무시
  IF v_distinct_reporters < 5 THEN
    RETURN NEW;
  END IF;

  -- 24h 정지 (기존 blocked_until이 더 길면 유지)
  v_new_block_until := now() + INTERVAL '24 hours';
  UPDATE users
    SET blocked_until = GREATEST(
      COALESCE(blocked_until, '1970-01-01'::TIMESTAMPTZ),
      v_new_block_until
    )
    WHERE id = v_author_id;

  -- 자동 처리 표시 (해당 신고 row의 status 갱신)
  UPDATE chat_message_reports
    SET status = 'resolved',
        admin_note = COALESCE(admin_note, '') ||
          E'\n[자동] 신고 ' || v_distinct_reporters || '건 누적 → 작성자 24h 정지',
        reviewed_at = now()
    WHERE message_id = NEW.message_id
      AND status = 'pending';

  -- 메시지도 soft delete
  UPDATE chat_messages
    SET is_deleted = TRUE
    WHERE id = NEW.message_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_report_auto_suspend ON chat_message_reports;
CREATE TRIGGER trg_chat_report_auto_suspend
  AFTER INSERT ON chat_message_reports
  FOR EACH ROW EXECUTE FUNCTION enforce_chat_report_auto_suspend();

COMMENT ON FUNCTION enforce_chat_report_auto_suspend() IS
  '와글 신고 5건 누적 시 작성자 24h 자동 정지 + 메시지 soft delete';
