-- 066: MD 카카오톡 검색 ID 추가
-- 기존 kakao_id는 OAuth 인증용, kakao_open_chat_url은 오픈채팅 URL (미사용)
-- kakao_talk_id는 고객이 카톡에서 검색할 수 있는 MD의 카카오톡 ID

ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_talk_id TEXT;

COMMENT ON COLUMN users.kakao_talk_id IS 'MD 카카오톡 검색 ID (고객 연락용, 선택)';
