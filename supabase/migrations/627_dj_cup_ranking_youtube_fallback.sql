-- ============================================================================
-- Migration 627: DJ컵 랭킹에 유튜브 썸네일 폴백용 youtube_url 노출
-- 날짜: 2026-09-03
-- 선행: 623(get_dj_cup_ranking), 612(soundcloud_artwork_url), 613(youtube_url)
--
-- 문제:
--   랭킹 표에서 Alan Walker·Solomun·Peggy Gou 같은 해외 스타 DJ가 전부
--   이니셜 글자로만 나온다. 이들은 사클 계정이 없고 유튜브 대표곡 URL만
--   있어서 soundcloud_artwork_url이 비어 있기 때문이다.
--
--   대결 카드(DjCupCard)는 이미 유튜브 썸네일로 폴백하고 있고(624),
--   next.config.ts remotePatterns에도 i.ytimg.com이 "DJ컵 폴백"으로 등록돼
--   있는데, 랭킹 RPC만 soundcloud_artwork_url 하나만 반환해서 같은 폴백을
--   쓸 수 없었다. 즉 폴백 인프라는 다 있는데 랭킹 화면에만 데이터가
--   안 내려가던 것.
--
-- 해결:
--   반환 컬럼에 youtube_url을 추가한다. 썸네일 URL 조립
--   (i.ytimg.com/vi/{id}/hqdefault.jpg)은 SQL이 아니라 프론트에서 한다 —
--   영상 ID 추출 규칙(youtubeVideoId)이 이미 TS에 있고, 채널 URL은 썸네일이
--   없어 제외해야 하는데 그 판정도 같은 함수에 들어 있다. SQL에 정규식을
--   중복 구현하면 두 곳이 어긋난다.
--
-- ⚠️ RETURNS TABLE 시그니처가 바뀌므로 CREATE OR REPLACE로는 안 되고
--    DROP 후 재생성해야 한다("cannot change return type of existing function").
--    이 함수는 pg_cron에서 호출되지 않는다(랭킹 페이지에서만 호출) — 확인함.
-- ============================================================================

DROP FUNCTION IF EXISTS get_dj_cup_ranking(INT);

CREATE FUNCTION get_dj_cup_ranking(p_limit INT DEFAULT 50)
RETURNS TABLE (
  dj_id           UUID,
  display_name    TEXT,
  slug            TEXT,
  artwork_url     TEXT,
  youtube_url     TEXT,
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
  'DJ 이상형 월드컵 랭킹. artwork_url(사클)이 비면 프론트가 youtube_url에서 '
  '썸네일을 조립해 폴백한다(DjCupCard와 동일 규약).';
