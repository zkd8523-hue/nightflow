-- 614: DJ 이상형 월드컵 — 집계 테이블 + 제출/랭킹 RPC
--
-- 배경
--   /dj-cup: 사클/유튜브 미리듣기가 되는 DJ 153명을 1:1로 붙여 우승자를 뽑는
--   바이럴 게임. 마지막 랭킹 페이지가 "나플에 DJ DB가 있다"는 소셜프루프 역할을
--   한다. 레퍼런스(이상형 월드컵)의 두 지표는 분모가 다르다:
--     우승비율 = 최종 우승 횟수 / 전체 게임 수      (분모: 전역)
--     승률     = 승리한 1:1 대결 / 그 DJ가 등장한 대결 (분모: DJ별)
--   전역 게임 수를 DJ 행에 넣을 수 없어 카운터 테이블(dj_cup_stats)과
--   게임 로그(dj_cup_plays) 두 개로 나눈다. 대결(매치) 단위 로그는 만들지
--   않는다 — 128강 1판이 127행이고, 그 데이터로 할 수 있는 건 이미
--   dj_cup_stats가 담은 집계뿐이다.
--
-- 쓰기 경로를 RPC 하나로 막는 이유
--   dj_cup_stats는 카운터라 UPDATE가 필요한데, anon에게 UPDATE를 열면
--   win_count = 999999 가 그대로 통과한다(UPDATE 정책의 WITH CHECK는 NEW만
--   보므로 "증분만 허용"을 표현할 수 없다). 그래서 두 테이블 모두 SELECT만
--   열고, 쓰기는 SECURITY DEFINER RPC(submit_dj_cup_result)로 통일한다.
--   dj_cup_plays는 SELECT 정책도 두지 않는다 — 남의 플레이 기록을 열람할
--   이유가 없고, 전역 게임 수는 get_dj_cup_ranking()이 대신 계산해 준다.
--
-- 비로그인 유저가 주 타겟이다(카톡 공유 유입) — 두 RPC 모두 anon에게 연다.

-- ============================================================================
-- 1) dj_cup_stats — DJ별 누적 카운터. 랭킹 화면의 유일한 소스.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dj_cup_stats (
  dj_id          UUID PRIMARY KEY REFERENCES djs(id) ON DELETE CASCADE,
  win_count      INT NOT NULL DEFAULT 0,
  appear_count   INT NOT NULL DEFAULT 0,
  champion_count INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2) dj_cup_plays — 게임 1판 = 1행. 전역 게임 수 분모 + 레이트리밋 근거.
--    4~128강 전부 허용(레퍼런스처럼 사다리 전체를 연다). 256강은 후보가
--    153명이라 낼 수 없어 CHECK에 아예 넣지 않는다 — 나중에 후보가 늘면
--    이 CHECK도 같이 넓혀야 한다.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dj_cup_plays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL,
  user_id      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  round_size   SMALLINT NOT NULL CHECK (round_size IN (4,8,16,32,64,128)),
  champion_id  UUID NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  match_count  SMALLINT NOT NULL,
  is_test      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 레이트리밋 조회: 같은 세션의 최근 N분 판수
CREATE INDEX IF NOT EXISTS idx_dj_cup_plays_session_created
  ON dj_cup_plays(session_id, created_at DESC);
-- 전역 게임 수(get_dj_cup_ranking)
CREATE INDEX IF NOT EXISTS idx_dj_cup_plays_created ON dj_cup_plays(created_at DESC);

-- ============================================================================
-- 3) RLS — 읽기는 dj_cup_stats만 공개. 쓰기는 전부 RPC로.
-- ============================================================================
ALTER TABLE dj_cup_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE dj_cup_plays ENABLE ROW LEVEL SECURITY;

-- 랭킹은 비로그인에게도 보여야 소셜프루프가 된다(596 lineup_likes와 같은 판단)
DROP POLICY IF EXISTS "Anyone can read dj cup stats" ON dj_cup_stats;
CREATE POLICY "Anyone can read dj cup stats" ON dj_cup_stats
  FOR SELECT USING (true);

-- dj_cup_plays는 SELECT 정책이 아예 없다 = anon/authenticated 모두 0행.
-- 전역 게임 수는 get_dj_cup_ranking()의 SECURITY DEFINER가 대신 센다.

REVOKE INSERT, UPDATE, DELETE ON dj_cup_stats FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON dj_cup_plays FROM anon, authenticated;

-- ============================================================================
-- 4) submit_dj_cup_result — 게임 1판 결과 제출.
--    실패는 전부 예외 — 부분 반영을 남기지 않는다.
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_dj_cup_result(
  p_session_id  UUID,
  p_round_size  SMALLINT,
  p_champion_id UUID,
  p_winners     UUID[],
  p_losers      UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_matches INT;
  v_distinct_count   INT;
  v_bad_count        INT;
  v_recent_plays     INT;
  v_total_plays      BIGINT;
  v_champion_rank     INT;
  v_is_test          BOOLEAN;
BEGIN
  -- 1) 라운드 크기 검증 (CHECK 제약과 이중 방어 — 여기서 먼저 걸러야
  --    아래 array_length 계산이 음수/0으로 새지 않는다)
  IF p_round_size NOT IN (4,8,16,32,64,128) THEN
    RAISE EXCEPTION 'dj_cup_invalid_round_size';
  END IF;

  -- 2) 매치 수 정합성 — 128강 결과에 매치 3개만 보내는 조작 차단
  v_expected_matches := p_round_size - 1;
  IF p_winners IS NULL OR p_losers IS NULL
     OR array_length(p_winners, 1) IS DISTINCT FROM v_expected_matches
     OR array_length(p_losers, 1)  IS DISTINCT FROM v_expected_matches
  THEN
    RAISE EXCEPTION 'dj_cup_match_count_mismatch';
  END IF;

  -- 3) 마지막 매치 승자 = 챔피언
  IF p_winners[array_upper(p_winners, 1)] IS DISTINCT FROM p_champion_id THEN
    RAISE EXCEPTION 'dj_cup_champion_mismatch';
  END IF;

  -- 4) 등장한 모든 UUID가 실제 후보 조건을 만족하는 djs 행인지 확인.
  --    후보 풀 밖 DJ(사클/유튜브 없는 DJ)가 랭킹에 등장하는 걸 막는 유일한 관문.
  SELECT COUNT(*) INTO v_bad_count
  FROM unnest(p_winners || p_losers) AS x(dj_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM djs d
    WHERE d.id = x.dj_id
      AND d.deleted_at IS NULL
      AND d.is_test = FALSE
      AND (d.soundcloud_url IS NOT NULL OR d.youtube_url IS NOT NULL)
  );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'dj_cup_invalid_candidate';
  END IF;

  -- 5) 등장 DJ 수가 라운드 인원을 넘지 않는지(대진표 조작 방지)
  SELECT COUNT(DISTINCT dj_id) INTO v_distinct_count
  FROM unnest(p_winners || p_losers) AS x(dj_id);
  IF v_distinct_count > p_round_size THEN
    RAISE EXCEPTION 'dj_cup_participant_overflow';
  END IF;

  -- 6) 레이트리밋 — 같은 세션이 최근 10분 3판을 넘으면 거부.
  --    완전 차단이 목적이 아니라 장난 수준 반복 제출의 비용을 올리는 것.
  SELECT COUNT(*) INTO v_recent_plays
  FROM dj_cup_plays
  WHERE session_id = p_session_id
    AND created_at > now() - interval '10 minutes';
  IF v_recent_plays >= 3 THEN
    RAISE EXCEPTION 'dj_cup_rate_limited';
  END IF;

  v_is_test := COALESCE((SELECT is_test FROM users WHERE id = auth.uid()), FALSE);

  -- 게임 로그 1행
  INSERT INTO dj_cup_plays (session_id, user_id, round_size, champion_id, match_count, is_test)
  VALUES (p_session_id, auth.uid(), p_round_size, p_champion_id, v_expected_matches, v_is_test);

  -- 카운터 — unnest + GROUP BY 로 DJ당 1행만 UPSERT (127번 UPDATE 방지).
  -- ON CONFLICT DO UPDATE 가 행 잠금을 잡으므로 동시 제출에도 카운터가 유실되지 않는다.
  WITH agg AS (
    SELECT dj_id, SUM(w)::INT AS wins, COUNT(*)::INT AS appears
    FROM (
      SELECT unnest(p_winners) AS dj_id, 1 AS w
      UNION ALL
      SELECT unnest(p_losers), 0
    ) t
    GROUP BY dj_id
  )
  INSERT INTO dj_cup_stats (dj_id, win_count, appear_count, champion_count)
  SELECT dj_id, wins, appears,
         CASE WHEN dj_id = p_champion_id THEN 1 ELSE 0 END
  FROM agg
  ON CONFLICT (dj_id) DO UPDATE SET
    win_count      = dj_cup_stats.win_count      + EXCLUDED.win_count,
    appear_count   = dj_cup_stats.appear_count   + EXCLUDED.appear_count,
    champion_count = dj_cup_stats.champion_count + EXCLUDED.champion_count,
    updated_at     = now();

  -- 우승 화면 소셜프루프용 — 한 번의 왕복으로 순위까지 준다
  SELECT COUNT(*) + 1 INTO v_champion_rank
  FROM dj_cup_stats
  WHERE champion_count > (SELECT champion_count FROM dj_cup_stats WHERE dj_id = p_champion_id);

  SELECT COUNT(*) INTO v_total_plays FROM dj_cup_plays WHERE is_test = FALSE;

  RETURN jsonb_build_object(
    'champion_rank', v_champion_rank,
    'total_plays', v_total_plays
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_dj_cup_result(UUID, SMALLINT, UUID, UUID[], UUID[])
  TO anon, authenticated;

-- ============================================================================
-- 5) get_dj_cup_ranking — 랭킹 조회.
--    dj_cup_plays에 anon SELECT가 없어 전역 게임 수를 직접 셀 수 없으므로
--    이 함수의 SECURITY DEFINER만 그 집계를 통과시킨다.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_dj_cup_ranking(p_limit INT DEFAULT 50)
RETURNS TABLE (
  dj_id           UUID,
  display_name    TEXT,
  slug            TEXT,
  artwork_url     TEXT,
  champion_count  INT,
  win_count       INT,
  appear_count    INT,
  champion_rate   NUMERIC,
  win_rate        NUMERIC,
  total_plays     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH total AS (
    SELECT COUNT(*)::BIGINT AS n FROM dj_cup_plays WHERE is_test = FALSE
  )
  SELECT
    s.dj_id,
    d.display_name,
    d.slug,
    d.soundcloud_artwork_url,
    s.champion_count,
    s.win_count,
    s.appear_count,
    ROUND(s.champion_count::NUMERIC / NULLIF((SELECT n FROM total), 0) * 100, 1),
    ROUND(s.win_count::NUMERIC      / NULLIF(s.appear_count, 0)       * 100, 1),
    (SELECT n FROM total)
  FROM dj_cup_stats s
  JOIN djs d ON d.id = s.dj_id
  WHERE d.deleted_at IS NULL AND d.is_test = FALSE
  ORDER BY s.champion_count DESC, s.win_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_dj_cup_ranking(INT) TO anon, authenticated;

COMMENT ON TABLE dj_cup_stats IS
  'DJ 이상형 월드컵 DJ별 누적 카운터. submit_dj_cup_result() RPC로만 갱신된다.';
COMMENT ON TABLE dj_cup_plays IS
  'DJ 이상형 월드컵 게임 1판 = 1행. 전역 게임 수 분모 + 세션 레이트리밋 근거. SELECT 정책 없음(개인 기록 비공개).';
