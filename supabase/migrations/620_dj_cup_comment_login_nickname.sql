-- 620: DJ컵 댓글 — 로그인 유저는 계정 닉네임을 기본값으로
--
-- 617은 닉네임 입력이 비면 무조건 '익명'으로 떨어뜨렸다. 비로그인 유입이 주
-- 타겟이라 그렇게 짰는데, 로그인 유저 입장에서는 이미 있는 자기 닉네임을 두고
-- 익명으로 찍히는 게 이상하다(계정에 display_name이 NOT NULL로 늘 존재한다).
--
-- 우선순위: 직접 입력 > 계정 닉네임 > '익명'
--   - 직접 입력이 먼저인 이유: 로그인했어도 이 판만 다른 이름으로 쓰고 싶을 수
--     있다. 계정 닉네임을 강제하면 그 선택지를 뺏는다.
--   - 비로그인은 auth.uid()가 NULL이라 서브쿼리가 NULL → '익명' 유지.
--
-- display_name은 2~16자(Mig 108)라 댓글 닉네임 제약(1~20자) 안에 들어간다.
-- 그래도 아래 left(,20) 절단은 그대로 두어 제약 위반으로 INSERT가 죽지 않게 한다.

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

  -- 직접 입력 > 계정 닉네임 > '익명'
  v_nick := COALESCE(
    v_nick,
    (SELECT display_name FROM users WHERE id = auth.uid() AND deleted_at IS NULL),
    '익명'
  );
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
