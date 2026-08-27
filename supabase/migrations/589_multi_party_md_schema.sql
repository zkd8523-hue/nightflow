-- ============================================================================
-- Migration 589: 다중 파트너(MD) 파티 채팅 — Phase 1 스키마
-- 날짜: 2026-08-27
-- 배경:
--   파티당 파트너를 여러 명 초대할 수 있게 바꾼다(칩 탭 UI).
--   puzzle_party_md의 PK가 puzzle_id 단독이라 물리적으로 한 행만 존재했다.
--   PK를 (puzzle_id, md_id)로 바꿔 여러 파트너 행을 허용한다.
--
--   기존 행은 puzzle_id가 이미 유일했으므로 새 PK를 그대로 만족한다.
--   → 중복 해소 작업 없음. 다운타임 없이 즉시 적용 가능.
--
--   puzzle_party_messages에 room_md_id를 추가해 방을 나눈다.
--   room_md_id IS NULL = 파티원방(방장+멤버 전용). 기존 메시지는 전부
--   이 값이 NULL이므로 자동으로 파티원방에 남는다 — 백필 불필요.
--
--   ⚠️ puzzle_party_reads는 건드리지 않는다. PK가 (puzzle_id, user_id)라
--   다중 MD에도 이미 안전하다 (조사 완료, ON CONFLICT 18곳 모두 무변경).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) puzzle_party_md PK 변경
-- ----------------------------------------------------------------------------
ALTER TABLE puzzle_party_md DROP CONSTRAINT puzzle_party_md_pkey;
ALTER TABLE puzzle_party_md ADD PRIMARY KEY (puzzle_id, md_id);
CREATE INDEX IF NOT EXISTS idx_party_md_md ON puzzle_party_md(md_id);

-- ----------------------------------------------------------------------------
-- 2) puzzle_party_messages에 방 discriminator 추가
--    NULL = 파티원방(방장+멤버). NOT NULL = 그 md_id의 전용 상담방.
-- ----------------------------------------------------------------------------
ALTER TABLE puzzle_party_messages
  ADD COLUMN IF NOT EXISTS room_md_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_party_msg_room
  ON puzzle_party_messages(puzzle_id, room_md_id, created_at);
