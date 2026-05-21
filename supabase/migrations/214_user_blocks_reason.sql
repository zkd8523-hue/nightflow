-- 유저 차단 사유 추가 (Apple Guideline 1.2 — developer notification)
ALTER TABLE user_blocks
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'other'
    CHECK (reason IN ('inappropriate_content', 'scam_suspect', 'harassment', 'spam', 'other')),
  ADD COLUMN IF NOT EXISTS memo TEXT;

-- Admin 검토용 인덱스
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_created
  ON user_blocks(blocked_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_blocks_reason
  ON user_blocks(reason);
