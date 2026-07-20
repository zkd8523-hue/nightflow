-- ============================================================
-- Migration 472: 1:1 DM 답글(인용)
-- ------------------------------------------------------------
-- 와글·조각 단체방에는 "밀어서 답글"이 있는데 DM만 없었다.
-- 조각 단체방(puzzle_party_messages.reply_to)과 같은 구조로 맞춘다.
--
-- 원본이 삭제돼도 답글은 남아야 하므로 ON DELETE SET NULL
-- (조각방과 동일 — 인용 박스만 "삭제된 메시지"로 바뀐다).
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES dm_messages(id) ON DELETE SET NULL;

-- 스레드 로드 시 인용 원본을 같이 끌어오기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_dm_messages_reply_to
  ON dm_messages (reply_to)
  WHERE reply_to IS NOT NULL;

COMMENT ON COLUMN dm_messages.reply_to IS
  '인용 답글 대상 메시지. 밀어서 답글(SwipeToReply)로 지정. 원본 삭제 시 NULL.';
