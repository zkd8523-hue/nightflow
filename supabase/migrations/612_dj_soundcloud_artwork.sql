-- ============================================================================
-- Migration 612: DJ 사운드클라우드 아트워크 캐시
-- 날짜: 2026-08-30
-- 선행: 557(djs.soundcloud_url)
--
-- 왜 저장해두는가:
--   라인업 최상단 발견 카드에 앨범아트를 띄우려면 이미지 주소가 필요한데,
--   사클 oEmbed 는 키 없이 열려 있지만 카드가 보일 때마다 부르면
--   (1) 첫 페인트가 외부 응답을 기다리고 (2) 조용히 레이트리밋에 걸릴 수 있다.
--   주소는 계정당 한 번만 바뀌므로 백필 때 같이 받아 저장한다.
--   (scripts/discover-dj-soundcloud*.mjs 가 이미 oEmbed 로 실존 검증을 하므로
--    같은 응답의 thumbnail_url 을 함께 넣으면 추가 호출이 0이다)
--
-- 값이 없으면 화면은 이니셜 원으로 떨어진다 — NOT NULL 로 묶지 않는다.
-- ============================================================================

ALTER TABLE djs ADD COLUMN IF NOT EXISTS soundcloud_artwork_url TEXT;

COMMENT ON COLUMN djs.soundcloud_artwork_url IS
  '사클 oEmbed thumbnail_url 캐시(i1.sndcdn.com). 발견 카드 아트워크용. 비어 있으면 이니셜 원으로 대체.';
