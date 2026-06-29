-- ============================================================================
-- 332/333 ROLLBACK (보관용 — 대시보드에서 필요 시 수동 실행)
-- 날짜: 2026-06-28
--
-- ⚠️ 보통은 여기까지 갈 필요 없음. 즉시 원복은 아래 한 줄이면 충분:
--     UPDATE app_settings SET bool_value = FALSE WHERE key = 'offer_chat_enabled';
--   → 채팅 UI 숨김 + send_offer_message 거부 + accept_offer 30크레딧 복귀.
--
-- 아래는 기능을 완전히 제거(DB 객체 삭제)할 때만 실행한다.
-- ============================================================================

-- 1) 채팅 함수 제거
DROP FUNCTION IF EXISTS send_offer_message(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS mark_offer_read(UUID);

-- 2) Realtime publication에서 제외 (있을 때만)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'puzzle_offer_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE puzzle_offer_messages;
  END IF;
END $$;

-- 3) 메시지 테이블 + 읽음 컬럼 제거
DROP TABLE IF EXISTS puzzle_offer_messages;
ALTER TABLE puzzle_offers DROP COLUMN IF EXISTS leader_read_at;
ALTER TABLE puzzle_offers DROP COLUMN IF EXISTS md_read_at;

-- 4) accept_offer를 Migration 170 원문으로 원복
--    (170_puzzle_two_phase_deadline.sql 의 accept_offer 정의를 그대로 재적용)
--    → 별도 파일 재실행 권장. 여기서는 is_offer_chat_enabled 의존을 끊기 위해
--      플래그를 FALSE로 두면 333 함수도 기존 30크레딧 동작이므로 굳이 안 바꿔도 됨.

-- 5) (선택) 플래그/설정 테이블 제거 — app_settings는 범용이라 보통 유지
-- DROP FUNCTION IF EXISTS is_offer_chat_enabled();
-- DROP TABLE IF EXISTS app_settings;
