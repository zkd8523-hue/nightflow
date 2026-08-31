-- 622: DJ컵 랭킹 — 우승비율이 100%로 깨지는 문제 (분모/분자 모집단 불일치)
--
-- 증상
--   "총 1판 집계"인데 서로 다른 DJ 8명이 동시에 우승비율 100%.
--   우승비율(100%)이 승률(80%)보다 큰 것도 신호였다 — 레퍼런스(이상형 월드컵)에서
--   우승비율은 분모가 전체 게임수라 승률보다 한참 작게 나온다(19% vs 82%).
--
-- 원인
--   submit_dj_cup_result()가 dj_cup_stats(분자)는 is_test 구분 없이 누적하는데,
--   get_dj_cup_ranking()의 total_plays(분모)는 is_test = FALSE만 센다.
--   실측: plays 9판 중 7판이 테스트 → stats에는 우승 9회가 쌓였는데 분모는 2.
--   테스트 판마다 다른 DJ가 우승했으니 각자 champion_count=1 / total_plays=1 = 100%.
--   614 주석이 "dj_cup_stats는 카운터"라고만 하고 is_test를 언급하지 않은 게
--   그대로 구현에 반영된 것이다.
--
-- 수정 방향
--   dj_cup_stats를 "실사용 집계 전용"으로 정의를 좁힌다. 테스트 판은 dj_cup_plays에
--   로그만 남기고 카운터는 건드리지 않는다. 분자·분모가 같은 모집단이 된다.
--   테스트 판의 카운터를 사후에 빼는 방식(보정)은 택하지 않았다 — 어느 판이
--   어느 DJ를 올렸는지 매치 단위 로그가 없어서(614에서 의도적으로 안 만듦)
--   역산이 불가능하다.

-- ============================================================================
-- 1) submit_dj_cup_result — 테스트 판은 카운터에 누적하지 않는다.
--    나머지 검증·레이트리밋·반환값은 614와 동일하다.
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
  v_champion_rank    INT;
  v_is_test          BOOLEAN;
BEGIN
  IF p_round_size NOT IN (4,8,16,32,64,128) THEN
    RAISE EXCEPTION 'dj_cup_invalid_round_size';
  END IF;

  v_expected_matches := p_round_size - 1;
  IF p_winners IS NULL OR p_losers IS NULL
     OR array_length(p_winners, 1) IS DISTINCT FROM v_expected_matches
     OR array_length(p_losers, 1)  IS DISTINCT FROM v_expected_matches
  THEN
    RAISE EXCEPTION 'dj_cup_match_count_mismatch';
  END IF;

  IF p_winners[array_upper(p_winners, 1)] IS DISTINCT FROM p_champion_id THEN
    RAISE EXCEPTION 'dj_cup_champion_mismatch';
  END IF;

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

  SELECT COUNT(DISTINCT dj_id) INTO v_distinct_count
  FROM unnest(p_winners || p_losers) AS x(dj_id);
  IF v_distinct_count > p_round_size THEN
    RAISE EXCEPTION 'dj_cup_participant_overflow';
  END IF;

  SELECT COUNT(*) INTO v_recent_plays
  FROM dj_cup_plays
  WHERE session_id = p_session_id
    AND created_at > now() - interval '10 minutes';
  IF v_recent_plays >= 3 THEN
    RAISE EXCEPTION 'dj_cup_rate_limited';
  END IF;

  v_is_test := COALESCE((SELECT is_test FROM users WHERE id = auth.uid()), FALSE);

  -- 로그는 테스트 판도 남긴다 — 레이트리밋 근거이자 "테스트로 몇 판 돌렸나"의 기록.
  INSERT INTO dj_cup_plays (session_id, user_id, round_size, champion_id, match_count, is_test)
  VALUES (p_session_id, auth.uid(), p_round_size, p_champion_id, v_expected_matches, v_is_test);

  -- ⚠️ 카운터는 실사용 판만. 이 IF가 이번 수정의 핵심이다.
  IF NOT v_is_test THEN
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
  END IF;

  -- 테스트 판은 카운터에 없으니 순위도 "집계된 것 중 몇 위"로만 답한다.
  SELECT COUNT(*) + 1 INTO v_champion_rank
  FROM dj_cup_stats
  WHERE champion_count > COALESCE(
    (SELECT champion_count FROM dj_cup_stats WHERE dj_id = p_champion_id), 0
  );

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
-- 2) 이미 오염된 카운터 정리.
--    매치 단위 로그가 없어 테스트 판 기여분만 빼낼 수 없으므로 전량 비운다.
--    실사용 판은 2판뿐이라 잃는 게 거의 없고, 남겨두면 분모만 고쳐도
--    "우승 9회 / 2판"이 그대로 남아 100%가 계속 보인다.
--    ⚠️ 실사용 판이 쌓인 뒤에는 이 DELETE를 재실행하지 말 것.
-- ============================================================================
DELETE FROM dj_cup_stats;

COMMENT ON TABLE dj_cup_stats IS
  'DJ 이상형 월드컵 DJ별 누적 카운터. submit_dj_cup_result() RPC로만 갱신되며 '
  '테스트 계정(users.is_test) 판은 누적하지 않는다 — get_dj_cup_ranking()의 '
  '분모(dj_cup_plays where is_test=false)와 모집단을 맞추기 위함(Migration 622).';
