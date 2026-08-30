-- 617: DJ 이상형 월드컵 공용 댓글
--
-- 월드컵이 하나뿐이므로 댓글창도 전역 하나다(피쿠와 같은 구조 — 월드컵 1개당
-- 공용 댓글창 1개, 각 댓글에 그 사람의 우승자가 자동으로 붙는다).
--
-- 왜 우승자를 같이 저장하나: 댓글 자체가 "다른 사람들은 누굴 뽑았나" 콘텐츠가
-- 되기 때문이다. 랭킹은 실사용 판이 쌓이기 전엔 비어 있는데, 댓글은 한 건만
-- 있어도 화면이 살아난다.
--
-- 로그인을 요구하지 않는다 — 월드컵은 비로그인 유입이 주 타겟이고, 댓글 한 줄
-- 쓰자고 카카오 로그인을 시키면 그 자리에서 이탈한다. 대신 세션 기준
-- 레이트리밋과 길이 제한으로 도배를 막는다.

CREATE TABLE IF NOT EXISTS dj_cup_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 익명 세션(localStorage UUID). 로그인 유저는 user_id도 함께 남는다.
  session_id   UUID NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nickname     TEXT NOT NULL DEFAULT '익명',
  body         TEXT NOT NULL,
  -- 이 댓글을 쓴 사람의 우승자. DJ가 지워져도 댓글은 남아야 하므로 SET NULL.
  champion_id  UUID REFERENCES djs(id) ON DELETE SET NULL,
  -- djs가 지워지거나 이름이 바뀌어도 "그때 뽑은 이름"이 남게 스냅샷을 둔다.
  champion_name TEXT,
  round_size   INTEGER,
  is_hidden    BOOLEAN NOT NULL DEFAULT FALSE,  -- 신고/관리자 숨김
  is_test      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dj_cup_comments_body_len     CHECK (char_length(body) BETWEEN 1 AND 300),
  CONSTRAINT dj_cup_comments_nickname_len CHECK (char_length(nickname) BETWEEN 1 AND 20)
);

CREATE INDEX IF NOT EXISTS idx_dj_cup_comments_recent
  ON dj_cup_comments (created_at DESC) WHERE is_hidden = FALSE;
CREATE INDEX IF NOT EXISTS idx_dj_cup_comments_session
  ON dj_cup_comments (session_id, created_at DESC);

ALTER TABLE dj_cup_comments ENABLE ROW LEVEL SECURITY;

-- 읽기는 누구나(숨김 제외). 쓰기는 RPC로만 — INSERT 정책을 주지 않는다.
DROP POLICY IF EXISTS "Anyone can read dj cup comments" ON dj_cup_comments;
CREATE POLICY "Anyone can read dj cup comments" ON dj_cup_comments
  FOR SELECT USING (is_hidden = FALSE);

-- ── 작성 RPC ────────────────────────────────────────────────────────────
-- 레이트리밋을 클라이언트가 아니라 여기서 강제한다(클라 검증은 우회된다).
CREATE OR REPLACE FUNCTION post_dj_cup_comment(
  p_session_id    UUID,
  p_body          TEXT,
  p_nickname      TEXT DEFAULT NULL,
  p_champion_id   UUID DEFAULT NULL,
  p_champion_name TEXT DEFAULT NULL,
  p_round_size    INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body     TEXT := btrim(p_body);
  v_nick     TEXT := NULLIF(btrim(COALESCE(p_nickname, '')), '');
  v_recent   INT;
  v_dupe     INT;
  v_is_test  BOOLEAN;
  v_id       UUID;
BEGIN
  IF v_body IS NULL OR char_length(v_body) = 0 THEN
    RETURN json_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;
  IF char_length(v_body) > 300 THEN
    RETURN json_build_object('success', false, 'error', '300자까지 쓸 수 있어요');
  END IF;

  v_nick := COALESCE(v_nick, '익명');
  IF char_length(v_nick) > 20 THEN
    v_nick := left(v_nick, 20);
  END IF;

  -- 분당 3건 (와글은 5건이지만 여기는 로그인도 없는 익명 댓글이라 더 좁힌다)
  SELECT COUNT(*) INTO v_recent
  FROM dj_cup_comments
  WHERE session_id = p_session_id AND created_at > now() - INTERVAL '1 minute';
  IF v_recent >= 3 THEN
    RETURN json_build_object('success', false, 'error', '조금 뒤에 다시 남겨주세요');
  END IF;

  -- 같은 세션이 1시간 내 같은 내용 반복 (와글과 같은 규약)
  SELECT COUNT(*) INTO v_dupe
  FROM dj_cup_comments
  WHERE session_id = p_session_id
    AND body = v_body
    AND created_at > now() - INTERVAL '1 hour';
  IF v_dupe > 0 THEN
    RETURN json_build_object('success', false, 'error', '방금 남긴 것과 같은 내용이에요');
  END IF;

  -- 테스트 계정 댓글은 프로덕션 목록에서 빠진다(is_test 규약)
  v_is_test := COALESCE((SELECT is_test FROM users WHERE id = auth.uid()), FALSE);

  INSERT INTO dj_cup_comments
    (session_id, user_id, nickname, body, champion_id, champion_name, round_size, is_test)
  VALUES
    (p_session_id, auth.uid(), v_nick, v_body, p_champion_id,
     NULLIF(btrim(COALESCE(p_champion_name, '')), ''), p_round_size, v_is_test)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION post_dj_cup_comment(UUID, TEXT, TEXT, UUID, TEXT, INTEGER)
  TO anon, authenticated;

-- ── 조회 RPC ────────────────────────────────────────────────────────────
-- is_test 필터를 SELECT 정책에 넣으면 테스트 계정 본인도 자기 댓글을 못 보게
-- 되므로, 목록은 RPC에서 거른다(클럽/깃발과 같은 판단).
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
    AND c.is_test = FALSE
    AND (p_before IS NULL OR c.created_at < p_before)
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION get_dj_cup_comments(INT, TIMESTAMPTZ) TO anon, authenticated;

COMMENT ON TABLE dj_cup_comments IS
  'DJ 이상형 월드컵 공용 댓글(전역 1개 스레드). 작성은 post_dj_cup_comment() RPC로만.';
