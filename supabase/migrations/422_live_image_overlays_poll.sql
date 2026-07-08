-- Migration 422: LIVE 편집 확장 — 이미지 오버레이 + 설문(투표)
--
--   1) chat_shots.image_overlays JSONB — 삽입 이미지 스티커 배열
--      [{ id, url, xPct, yPct, widthPct, rotation }]
--   2) chat_shots.poll JSONB — 설문 (1개/샷)
--      { id, question, options: [{ id, text }] }
--   3) chat_shot_poll_votes — 투표 (샷당 유저 1표) + 집계 뷰 + 투표 RPC

-- ============================================
-- 1) 컬럼 추가
-- ============================================
ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS image_overlays JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS poll JSONB;

COMMENT ON COLUMN chat_shots.image_overlays IS
  'Migration 422: 삽입 이미지 스티커 [{id,url,xPct,yPct,widthPct,rotation}].';
COMMENT ON COLUMN chat_shots.poll IS
  'Migration 422: 설문 {id, question, options:[{id,text}]}. NULL=설문 없음.';

-- ============================================
-- 2) 투표 테이블 (샷당 유저 1표)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_shot_poll_votes (
  shot_id    UUID NOT NULL REFERENCES chat_shots(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shot_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_shot ON chat_shot_poll_votes(shot_id);

ALTER TABLE chat_shot_poll_votes ENABLE ROW LEVEL SECURITY;

-- 집계 표시를 위해 누구나 SELECT 허용 (개별 유저 노출은 프론트에서 카운트만 사용)
DROP POLICY IF EXISTS "Anyone can read poll votes" ON chat_shot_poll_votes;
CREATE POLICY "Anyone can read poll votes"
  ON chat_shot_poll_votes FOR SELECT USING (TRUE);

-- 쓰기는 cast_poll_vote RPC(SECURITY DEFINER)로만

COMMENT ON TABLE chat_shot_poll_votes IS
  'Migration 422: LIVE 설문 투표. 샷당 유저 1표(PK). 변경(재투표) 허용은 RPC upsert로.';

-- ============================================
-- 3) 집계 뷰 (option별 카운트)
-- ============================================
CREATE OR REPLACE VIEW shot_poll_results AS
SELECT shot_id, option_id, COUNT(*)::INT AS votes
FROM chat_shot_poll_votes
GROUP BY shot_id, option_id;

GRANT SELECT ON shot_poll_results TO anon, authenticated;

-- ============================================
-- 4) 투표 RPC — upsert (재투표 시 이전 표 교체)
-- ============================================
CREATE OR REPLACE FUNCTION cast_poll_vote(p_shot_id UUID, p_option_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_poll JSONB;
  v_valid BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 설문 존재 + option_id 유효성 검증
  SELECT poll INTO v_poll FROM chat_shots WHERE id = p_shot_id AND expires_at > now();
  IF v_poll IS NULL THEN
    RAISE EXCEPTION 'POLL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_poll->'options') o
    WHERE o->>'id' = p_option_id
  ) INTO v_valid;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_OPTION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO chat_shot_poll_votes (shot_id, user_id, option_id)
    VALUES (p_shot_id, v_uid, p_option_id)
    ON CONFLICT (shot_id, user_id)
    DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now();

  RETURN json_build_object('success', TRUE, 'option_id', p_option_id);
END;
$$;

GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cast_poll_vote(UUID, TEXT) IS
  'Migration 422: LIVE 설문 투표 (샷당 유저 1표, 재투표 시 교체).';
