-- 623: DJ컵 랭킹 — 테스트 판도 다시 집계에 포함 (622 되돌림)
--
-- 622는 dj_cup_stats(분자)에서 테스트 판을 빼는 방향으로 수정했으나,
-- 사용자 확인 결과 방향이 반대였다 — 테스트 판도 실사용 판과 동일하게
-- 집계에 포함시켜야 한다.
--
-- 622가 이미 dj_cup_stats를 DELETE로 비웠기 때문에, 그 이후 판(테스트 여부
-- 무관)은 이 마이그레이션 적용 전까지 카운터에 하나도 안 쌓인 상태다.
-- 과거 승률(win_count/appear_count)은 매치 단위 로그가 없어(614 설계) 복구
-- 불가능하므로 복구하지 않는다 — 지금부터 다시 쌓이게만 한다.
--
-- 애초 100% 버그(분자 9 vs 분모 2)의 진짜 원인은 "테스트를 뺐어야 하는데
-- 안 뺐다"가 아니라 "분자와 분모가 서로 다른 조건으로 계산됐다"였다.
-- 그러니 수정 방향은: 테스트 여부와 무관하게 분자·분모를 항상 같은 모집단
-- (전체 판)으로 맞춘다.

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

  INSERT INTO dj_cup_plays (session_id, user_id, round_size, champion_id, match_count, is_test)
  VALUES (p_session_id, auth.uid(), p_round_size, p_champion_id, v_expected_matches, v_is_test);

  -- 614로 되돌림: 테스트 여부와 무관하게 항상 누적한다.
  -- get_dj_cup_ranking()의 total_plays도 이 마이그레이션에서 테스트 포함
  -- 전체로 맞춰서, 분자·분모가 다시 같은 모집단이 되게 한다.
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

  SELECT COUNT(*) + 1 INTO v_champion_rank
  FROM dj_cup_stats
  WHERE champion_count > COALESCE(
    (SELECT champion_count FROM dj_cup_stats WHERE dj_id = p_champion_id), 0
  );

  -- total_plays도 테스트 포함 전체로. get_dj_cup_ranking()과 통일.
  SELECT COUNT(*) INTO v_total_plays FROM dj_cup_plays;

  RETURN jsonb_build_object(
    'champion_rank', v_champion_rank,
    'total_plays', v_total_plays
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_dj_cup_result(UUID, SMALLINT, UUID, UUID[], UUID[])
  TO anon, authenticated;

-- ============================================================================
-- get_dj_cup_ranking — total_plays를 테스트 포함 전체로 맞춘다.
-- (614는 is_test 구분이 아예 없었고, 622가 실사용만으로 좁혔던 것을 되돌린다)
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
    SELECT COUNT(*)::BIGINT AS n FROM dj_cup_plays
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
  'DJ 이상형 월드컵 DJ별 누적 카운터. submit_dj_cup_result() RPC로만 갱신되며 '
  '테스트 계정 판도 포함해 누적한다(Migration 623) — get_dj_cup_ranking()의 '
  '분모(dj_cup_plays 전체)와 모집단을 맞추기 위함.';
