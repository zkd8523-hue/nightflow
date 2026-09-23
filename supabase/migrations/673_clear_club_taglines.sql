-- ============================================================================
-- Migration 673: 클럽 한 줄 소개(tagline) 전부 비움 (사장님 결정, 2026-09-23)
--
-- 650에서 넣은 tagline("Itaewon's hip-hop home — nonstop till 7am" 류)을 카드에서
-- 뺀다. 671·672로 추천 4곳에 "왜 추천하나" 문단이 생기면서 카드의 한 줄 소개는
-- 그것과 겹치고, 나머지 16곳은 소개 없이 이름·평점만 남는 게 더 깔끔하다.
--
-- 컬럼은 남긴다(DROP 안 함). 비면 화면에서 그 줄을 통째로 접는 게 650의 설계라
-- 값만 NULL로 만들면 카드·상세 시트 양쪽에서 즉시 사라진다. 컬럼을 지우면
-- select 12곳이 400을 내고 코드 배포가 선행돼야 해서 순서가 꼬인다.
--
-- 범위: tagline이 있는 20곳 전부. 추천 4곳만 빼는 게 의도였다면 WHERE에
-- area_pick = TRUE 를 붙이면 된다.
--
-- 렌더 위치 실측: ClubsClient(카드)·EnHomeClient(홈 카드)·ForeignClubDetailPanel
-- (상세 시트)·(main)/flags/new(폐기된 깃발 인테이크). 한국어 트랙 클럽 페이지는
-- 안 읽는다 — 외국어 전용 컬럼이라 지워도 한국어 쪽은 무영향.
-- ============================================================================

UPDATE clubs SET
  tagline_ko    = NULL,
  tagline_en    = NULL,
  tagline_ja    = NULL,
  tagline_zh    = NULL,
  tagline_zh_tw = NULL
WHERE deleted_at IS NULL
  AND (tagline_ko IS NOT NULL OR tagline_en IS NOT NULL OR tagline_ja IS NOT NULL
       OR tagline_zh IS NOT NULL OR tagline_zh_tw IS NOT NULL);
