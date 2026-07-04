-- ============================================================================
-- Migration 409: user_events 보안 강화
-- 날짜: 2026-07-05
-- 설명:
--   Migration 408의 "anyone can insert events" WITH CHECK (true) 정책이
--   user_id 위조를 허용하는 문제를 수정.
--
--   변경 사항:
--   1. 관대 INSERT 정책 삭제 (id 위조 방어)
--   2. properties/event_name/path 크기 제한 트리거 추가 (DoS 방어)
--   3. 클라이언트 방어(userEvents.ts)는 별도 배선. 이 마이그레이션은 DB 층만.
--
--   ⚠️ 이 마이그레이션은 이미 Supabase Dashboard에서 수동 적용됨(2026-07-05).
--   git에는 문서화 목적으로만 커밋. 재실행 안전(IF EXISTS/OR REPLACE).
-- ============================================================================

-- 1) 관대 정책 제거
DROP POLICY IF EXISTS "anyone can insert events" ON user_events;

-- 2) 크기 제한 트리거
CREATE OR REPLACE FUNCTION check_user_event_size()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.properties IS NOT NULL AND LENGTH(NEW.properties::text) > 4096 THEN
    RAISE EXCEPTION 'properties too large (max 4096 bytes)';
  END IF;
  IF LENGTH(NEW.event_name) > 64 THEN
    RAISE EXCEPTION 'event_name too long (max 64 chars)';
  END IF;
  IF LENGTH(COALESCE(NEW.path, '')) > 512 THEN
    RAISE EXCEPTION 'path too long';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_events_size_guard ON user_events;
CREATE TRIGGER user_events_size_guard
  BEFORE INSERT ON user_events
  FOR EACH ROW EXECUTE FUNCTION check_user_event_size();
