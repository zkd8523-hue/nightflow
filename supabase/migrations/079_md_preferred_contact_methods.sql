-- Migration 079: MD 선호 연락 수단 설정
-- MD가 낙찰자에게 표시할 연락 수단을 직접 선택. NULL이면 기존대로 전부 표시 (하위 호환)

ALTER TABLE users ADD COLUMN preferred_contact_methods text[] DEFAULT NULL;

COMMENT ON COLUMN users.preferred_contact_methods IS 'MD가 낙찰자에게 표시할 연락 수단. dm/kakao/phone. NULL=전부 표시';
