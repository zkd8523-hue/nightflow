-- djs.youtube_url 추가.
--
-- 배경: DJ 인스타 프로필의 바이오·외부링크를 긁어 djs.soundcloud_url 을 채우는
-- 경로(scripts/discover-dj-soundcloud.mjs)가 이미 돌고 있는데, 같은 응답 안에
-- 들어 있는 유튜브 링크는 파싱하지 않고 버리고 있었다. 담을 칸이 없어서였다.
--
-- artists 테이블에는 youtube_url 이 이미 있다(Migration 568) — 같은 규약으로 맞춘다.
-- 값은 전체 URL 을 저장한다(핸들만 저장하는 instagram 규약과 다름 —
-- 유튜브는 @handle / channel/UC... / c/name 세 형태가 공존해 URL 이 정본이다).

ALTER TABLE djs ADD COLUMN IF NOT EXISTS youtube_url TEXT;

COMMENT ON COLUMN djs.youtube_url IS
  'DJ 유튜브 채널 URL 전체. 인스타 프로필 외부링크에서 수집(discover-dj-soundcloud.mjs). artists.youtube_url 과 동일 규약.';
