-- MD 찜 기능
-- 유저가 특정 MD를 찜할 수 있도록 함 (클럽 찜과 별개)

CREATE TABLE user_favorite_mds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  md_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, md_id)
);

CREATE INDEX idx_favorite_mds_user ON user_favorite_mds(user_id);
CREATE INDEX idx_favorite_mds_md   ON user_favorite_mds(md_id);

ALTER TABLE user_favorite_mds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own MD favorites" ON user_favorite_mds
  FOR ALL USING (auth.uid() = user_id);
