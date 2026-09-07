-- ============================================================================
-- Migration 662: DJ컵 랭킹에 미리듣기용 soundcloud_url·instagram 노출
-- 날짜: 2026-09-07
-- 선행: 627(get_dj_cup_ranking에 youtube_url 추가)
--
-- 문제:
--   랭킹에서 DJ 이름을 누르면 /dj/{slug} 프로필 페이지로 완전히 나가버린다.
--   여기서 곧바로 "미리듣기" 모달(DjProfileSheet)을 띄우고 싶은데, 그
--   컴포넌트가 재생원 판별에 쓰는 soundcloud_url이 랭킹 RPC엔 없다
--   (artwork_url=soundcloud_artwork_url은 썸네일 캐시일 뿐 재생 URL이 아님).
--
-- 해결:
--   반환 컬럼에 soundcloud_url·instagram을 추가한다. DjProfileSheet의
--   DjProfileTarget이 그대로 요구하는 필드들이라 프론트에서 별도 조회 없이
--   즉시 시트를 열 수 있다.
--
-- ⚠️ RETURNS TABLE 시그니처가 바뀌므로 CREATE OR REPLACE로는 안 되고
--    DROP 후 재생성해야 한다. pg_cron에서 호출되지 않음(랭킹 페이지 전용, 627 확인 유지).
-- ============================================================================

DROP FUNCTION IF EXISTS get_dj_cup_ranking(INT);

CREATE FUNCTION get_dj_cup_ranking(p_limit INT DEFAULT 50)
RETURNS TABLE (
  dj_id           UUID,
  display_name    TEXT,
  slug            TEXT,
  artwork_url     TEXT,
  youtube_url     TEXT,
  soundcloud_url  TEXT,
  instagram       TEXT,
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
    d.youtube_url,
    d.soundcloud_url,
    d.instagram,
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

COMMENT ON FUNCTION get_dj_cup_ranking(INT) IS
  'DJ 이상형 월드컵 랭킹. soundcloud_url·youtube_url·instagram을 함께 내려줘 '
  '랭킹 표에서 DJ를 눌렀을 때 페이지 이동 없이 미리듣기 모달(DjProfileSheet)을 '
  '바로 열 수 있게 한다.';
