-- MD 파트너 승인 후 축하 메시지 최초 1회 노출 추적
-- 홈페이지에서 Welcome Sheet를 표시한 후 true로 업데이트
ALTER TABLE users ADD COLUMN md_welcome_shown BOOLEAN NOT NULL DEFAULT false;
