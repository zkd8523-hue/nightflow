-- ============================================================================
-- Migration 098: 퍼즐 찜 (puzzle_interests)
-- ============================================================================

CREATE TABLE puzzle_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, puzzle_id)
);

CREATE INDEX idx_puzzle_interests_user ON puzzle_interests(user_id);
CREATE INDEX idx_puzzle_interests_puzzle ON puzzle_interests(puzzle_id);

ALTER TABLE puzzle_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own puzzle interests" ON puzzle_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own puzzle interests" ON puzzle_interests
  FOR ALL USING (auth.uid() = user_id);
