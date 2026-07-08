-- Migration 424: LIVE 조회 추적 (인스타 "본 사람" / 활동 탭)
--
--   chat_shot_views: 샷당 유저 1행 (누가 봤는지). 작성자만 목록 조회 가능.
--   활동 시트에서 좋아요한 사람을 최상단에 노출 (프론트에서 chat_shot_likes와 조인).

CREATE TABLE IF NOT EXISTS chat_shot_views (
  shot_id   UUID NOT NULL REFERENCES chat_shots(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shot_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_shot_views_shot ON chat_shot_views(shot_id, viewed_at DESC);

ALTER TABLE chat_shot_views ENABLE ROW LEVEL SECURITY;

-- 본인 조회 기록 INSERT (viewer 본인만). 본인 샷은 기록 안 함(프론트에서 스킵).
DROP POLICY IF EXISTS "User can record own view" ON chat_shot_views;
CREATE POLICY "User can record own view"
  ON chat_shot_views
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- 작성자만 자기 샷의 조회 목록을 볼 수 있다.
DROP POLICY IF EXISTS "Author can read views of own shots" ON chat_shot_views;
CREATE POLICY "Author can read views of own shots"
  ON chat_shot_views
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_shots s
      WHERE s.id = chat_shot_views.shot_id AND s.author_id = auth.uid()
    )
  );

COMMENT ON TABLE chat_shot_views IS
  'Migration 424: LIVE 조회 추적. 작성자만 목록 조회. 활동 탭 = 좋아요(최상단)+본 사람.';

-- 조회 기록 RPC — 중복(재조회) 시 무시. (본인 샷/미로그인은 프론트에서 스킵)
CREATE OR REPLACE FUNCTION record_shot_view(p_shot_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_author UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT author_id INTO v_author FROM chat_shots WHERE id = p_shot_id;
  -- 본인 샷은 조회수에 안 넣음
  IF v_author IS NULL OR v_author = v_uid THEN RETURN; END IF;
  INSERT INTO chat_shot_views (shot_id, viewer_id)
    VALUES (p_shot_id, v_uid)
    ON CONFLICT (shot_id, viewer_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION record_shot_view(UUID) TO authenticated;

COMMENT ON FUNCTION record_shot_view(UUID) IS
  'Migration 424: LIVE 조회 기록 (본인 샷 제외, 중복 무시).';
