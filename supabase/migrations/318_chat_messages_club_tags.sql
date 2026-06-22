-- Migration 313: 와글 메시지에 클럽 해시태그 박제
-- - 본문에서 #아레나 같은 해시태그 입력 시 매칭된 클럽 ID 배열을 저장
-- - 렌더링 시 본문 텍스트의 #해시태그와 club_tags의 ID를 매칭해 링크화
-- - 클릭 시 /clubs/{id}로 이동

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS club_tags UUID[] NOT NULL DEFAULT '{}';

-- 클럽 태그 역색인 (특정 클럽이 태그된 와글 검색 등 후속 활용)
CREATE INDEX IF NOT EXISTS idx_chat_messages_club_tags
  ON chat_messages USING GIN (club_tags)
  WHERE is_deleted = FALSE;

COMMENT ON COLUMN chat_messages.club_tags IS
  '본문에 포함된 #클럽 해시태그의 클럽 ID 배열. 본문 텍스트의 #이름과 매칭해 렌더링 시 링크화.';
