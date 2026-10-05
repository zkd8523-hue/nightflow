-- 688: 신보(발매) 테이블 — 뉴스레터 "이주의 발매" 코너용
--
-- 왜 필요한가: 공연은 비는 주가 있지만 발매는 매주 반드시 있다. 뉴스레터가
-- 공연만으로 돌아가면 한산한 주에 보낼 거리가 없어진다. 발매 코너가 그 바닥을 받친다.
--
-- 소스 (전부 무료·API키 불필요, 2026-10-04 실측 검증):
--   hiphople  : https://hiphople.com/news_kr/rss  — 국내 힙합 신보. 15건 중 11건이
--               '아티스트, 포맷 [앨범] 공개' 패턴. 나머지 4건은 마약 사건·발매 예고·
--               트랙리스트라 오히려 걸러져야 할 노이즈였다. 커버는 RSS 필드가 아니라
--               description 안 <img> 에 있고, /files/... 상대경로가 img.hiphople.com
--               으로 301 리다이렉트된다(실측 4MB JPEG 정상).
--   poclanos  : https://poclanos.com/wp-json/wp/v2/download — 인디 유통사 WP REST.
--               download_category 18=HipHop, 16=R&B/Soul. featuredmedia 로 커버.
--
-- ⚠️ 커버 이미지는 레이블 저작물이다. 어떤 API도 사용 라이선스를 주지 않는다.
--    인용(저작권법 28조)·공정이용(35조의5)으로 방어하려면 발행 시 아래를 지켜야 한다:
--      1) 릴리스마다 2~3문장 편집 코멘트를 붙인다 (가장 중요)
--      2) 썸네일 크기(300~600px)만. 원본 전면 게재 금지
--      3) 크롭·오버레이 금지, 원본 비율 유지
--      4) 원 출처로 링크
--      5) 권리자 삭제 요청 시 즉시 내린다
--    그래서 editor_note 는 발행 전 필수 입력으로 본다(DB 제약은 아니고 운영 규칙).

CREATE TABLE IF NOT EXISTS music_releases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 식별
  source        TEXT NOT NULL CHECK (source IN ('hiphople','poclanos','manual')),
  source_url    TEXT NOT NULL,            -- 원문 기사/페이지. 출처 링크로 쓴다
  source_guid   TEXT NOT NULL,            -- 소스 내 고유키(RSS guid, WP post id)

  -- 내용
  artist        TEXT NOT NULL,
  title         TEXT NOT NULL,            -- 앨범/곡명
  format        TEXT,                     -- 정규 앨범 / EP / 싱글 등. 원문 표기 그대로
  released_on   DATE NOT NULL,
  genre         TEXT,                     -- hiphop / rnb / indie ...
  cover_url     TEXT,                     -- 원본 호스트 URL. 재호스팅하지 않는다
  summary       TEXT,                     -- 원문에서 뽑은 짧은 설명

  -- 편집
  editor_note   TEXT,                     -- "왜 이 앨범인가" 2~3문장. 발행 전 필수
  featured      BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,              -- 뉴스레터에 실제로 나간 시각

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 같은 글을 매일 다시 긁어도 한 번만 들어간다
  UNIQUE (source, source_guid)
);

COMMENT ON TABLE  music_releases IS '뉴스레터 "이주의 발매" 코너용 신보. hiphople RSS / poclanos WP REST 에서 수집';
COMMENT ON COLUMN music_releases.cover_url IS '원본 호스트 URL 그대로. 자체 서버 재호스팅 금지(저작권)';
COMMENT ON COLUMN music_releases.editor_note IS '왜 이 앨범인가 2~3문장. 인용·공정이용 방어의 핵심이라 발행 전 필수';

CREATE INDEX IF NOT EXISTS idx_releases_date ON music_releases (released_on DESC);
CREATE INDEX IF NOT EXISTS idx_releases_unpublished
  ON music_releases (released_on DESC) WHERE published_at IS NULL;

ALTER TABLE music_releases ENABLE ROW LEVEL SECURITY;

-- 읽기는 공개(뉴스레터 웹 아카이브에서 쓴다). 쓰기는 service_role 만.
DROP POLICY IF EXISTS "music_releases read" ON music_releases;
CREATE POLICY "music_releases read" ON music_releases FOR SELECT USING (true);

DROP TRIGGER IF EXISTS music_releases_updated_at ON music_releases;
CREATE TRIGGER music_releases_updated_at
  BEFORE UPDATE ON music_releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 확인:
--   SELECT released_on, artist, title, format, source
--   FROM music_releases ORDER BY released_on DESC LIMIT 10;
