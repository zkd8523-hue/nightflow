-- 058: MD 카카오톡 오픈채팅 URL 컬럼 추가
-- MDApplyForm에서 필수 입력 필드로 사용되지만 DB 컬럼이 누락되어 있었음

ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_open_chat_url TEXT;

COMMENT ON COLUMN users.kakao_open_chat_url IS 'MD 카카오톡 오픈채팅 URL (낙찰자 연락용)';
