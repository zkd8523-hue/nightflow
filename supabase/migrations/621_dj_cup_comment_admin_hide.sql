-- 621: DJ컵 댓글 — Admin 숨김/복구 RPC
--
-- 617이 is_hidden 컬럼과 "신고/관리자 숨김" 주석까지 만들어놨지만 정작 그걸
-- 건드릴 경로가 없었다. 지금까지는 service_role 키로 직접 DELETE 하는 수밖에
-- 없었는데, 그건 사람이 매번 터미널을 잡아야 한다는 뜻이다.
--
-- hard DELETE가 아니라 is_hidden 토글인 이유:
--   1) 오조작 복구가 된다. 댓글은 한 번 지우면 원문이 사라진다.
--   2) 617의 조회 RPC가 이미 is_hidden = FALSE로 거르고 있어서, 숨기는 순간
--      목록에서 빠진다 — 조회 쪽은 손댈 필요가 없다.
--   3) 도배범이 같은 세션으로 다시 쓸 때 레이트리밋 카운트가 남아야 한다.
--      지워버리면 분당 3건 제한이 리셋돼서 오히려 도배가 쉬워진다.

-- ── 숨김/복구 토글 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_set_dj_cup_comment_hidden(
  p_comment_id UUID,
  p_hidden     BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('success', false, 'error', '권한이 없어요');
  END IF;

  UPDATE dj_cup_comments
  SET is_hidden = p_hidden
  WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '댓글을 찾을 수 없어요');
  END IF;

  RETURN json_build_object('success', true, 'hidden', p_hidden);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_dj_cup_comment_hidden(UUID, BOOLEAN) TO authenticated;

-- ── Admin 목록 조회 ─────────────────────────────────────────────────────
-- 일반 조회 RPC(617/619)는 숨김·테스트 댓글을 걸러버리므로 관리 화면에서 쓸 수
-- 없다. 관리자는 숨긴 것까지 다 봐야 복구할 수 있다.
CREATE OR REPLACE FUNCTION admin_list_dj_cup_comments(
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id            UUID,
  nickname      TEXT,
  body          TEXT,
  champion_name TEXT,
  round_size    INTEGER,
  is_hidden     BOOLEAN,
  is_test       BOOLEAN,
  user_id       UUID,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN;  -- 권한 없으면 빈 결과
  END IF;

  RETURN QUERY
  SELECT c.id, c.nickname, c.body, c.champion_name, c.round_size,
         c.is_hidden, c.is_test, c.user_id, c.created_at
  FROM dj_cup_comments c
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_dj_cup_comments(INT) TO authenticated;

COMMENT ON FUNCTION admin_set_dj_cup_comment_hidden(UUID, BOOLEAN) IS
  'Migration 621: Admin이 DJ컵 댓글을 숨기거나 되살린다(hard delete 아님).';
