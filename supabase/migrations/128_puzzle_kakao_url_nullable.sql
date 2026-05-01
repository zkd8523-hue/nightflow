-- puzzles.kakao_open_chat_url: NOT NULL + CHECK 제약 제거
-- 카카오 URL을 깃발 등록 시점이 아닌 오퍼 수락 시점에 입력받도록 변경

ALTER TABLE puzzles
  ALTER COLUMN kakao_open_chat_url DROP NOT NULL,
  ALTER COLUMN kakao_open_chat_url DROP DEFAULT;

ALTER TABLE puzzles
  DROP CONSTRAINT IF EXISTS puzzles_kakao_open_chat_url_check;
