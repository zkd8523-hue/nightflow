-- 070: 관심 클럽(찜) 기능
-- 유저가 클럽을 찜하면 해당 클럽에 새 경매가 올라올 때 알림 수신

CREATE TABLE user_favorite_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, club_id)
);

CREATE INDEX idx_favorite_clubs_user ON user_favorite_clubs(user_id);
CREATE INDEX idx_favorite_clubs_club ON user_favorite_clubs(club_id);

ALTER TABLE user_favorite_clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites" ON user_favorite_clubs
  FOR ALL USING (auth.uid() = user_id);
