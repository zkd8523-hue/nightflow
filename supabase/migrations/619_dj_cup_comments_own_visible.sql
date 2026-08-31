-- 619: DJ컵 댓글 — 테스트 계정도 자기 댓글은 보이게
--
-- 617의 get_dj_cup_comments()는 is_test = FALSE로만 걸렀다. 그래서 테스트
-- 계정으로 로그인한 사람이 댓글을 남기면 저장은 성공(success: true)하는데
-- 바로 이어지는 목록에서 자기 글만 사라진다 — 저장이 안 되는 것처럼 보인다.
--
-- 617 주석은 "is_test 필터를 SELECT 정책에 넣으면 테스트 계정 본인도 자기
-- 댓글을 못 보게 되므로 목록은 RPC에서 거른다"고 적어놨지만, 정작 RPC에서도
-- 똑같이 가려버려서 주석의 의도와 구현이 어긋나 있었다. 그 의도대로 맞춘다.
--
-- 남에게는 여전히 안 보인다(is_test 규약 유지). 본인에게만 보인다.

CREATE OR REPLACE FUNCTION get_dj_cup_comments(
  p_limit  INT DEFAULT 30,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id            UUID,
  nickname      TEXT,
  body          TEXT,
  champion_name TEXT,
  champion_slug TEXT,
  round_size    INTEGER,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nickname, c.body, c.champion_name, d.slug, c.round_size, c.created_at
  FROM dj_cup_comments c
  LEFT JOIN djs d ON d.id = c.champion_id AND d.deleted_at IS NULL
  WHERE c.is_hidden = FALSE
    -- 테스트 댓글은 남에게 안 보이되, 작성 본인에게는 보인다.
    -- auth.uid()가 NULL(비로그인)이면 c.user_id = NULL 비교가 NULL이라
    -- 자동으로 FALSE 취급 — 비로그인에게 테스트 댓글이 새지 않는다.
    AND (c.is_test = FALSE OR c.user_id = auth.uid())
    AND (p_before IS NULL OR c.created_at < p_before)
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION get_dj_cup_comments(INT, TIMESTAMPTZ) TO anon, authenticated;
