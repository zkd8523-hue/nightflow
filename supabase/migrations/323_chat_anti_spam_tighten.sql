-- Migration 321: 와글 도배 정책 강화 (Migration 288 재정의)
-- 변경:
--   - 5초 간격 → 제거 (사용자 응답성 우선)
--   - 분당 10건 → 분당 5건
--   - 연속 중복 1건 → 1시간 동안 같은 텍스트 거부
--
-- 참고: 트위터 X 기준 (2026)
--   - 2,400/일, ~50/30분, 24-48h 동일 텍스트 중복 차단

CREATE OR REPLACE FUNCTION enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_count INTEGER;
  v_recent_duplicate INTEGER;
BEGIN
  -- 1) 1시간 내 같은 텍스트 중복 차단 (트위터 24-48h보단 느슨, 첫 운영용)
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

  -- 2) 분당 5건 제한 (이전 10건 → 5건으로 강화)
  SELECT COUNT(*) INTO v_minute_count
    FROM chat_messages
    WHERE author_id = NEW.author_id
      AND is_deleted = FALSE
      AND created_at >= NEW.created_at - INTERVAL '60 seconds';

  IF v_minute_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT_PER_MINUTE: 1분에 5개까지만 보낼 수 있어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5초 간격 제거 — 사용자 응답성 우선
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_chat_rate_limit() IS
  '와글 도배 방지 (Migration 321): 분당 5개, 1시간 내 같은 텍스트 중복 차단. 5초 간격 제거.';
