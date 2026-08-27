-- ============================================================================
-- Migration 581: 신규 파티/공연 venue 후보 12곳 — club_name_registry 등록
-- 날짜: 2026-08-27
-- 배경:
--   "DJ 라인업이 있는 파티, 래퍼/가수 공연 위주"로 힙합플레이야 캘린더 게시물
--   실측 스크래핑 + 웹서치로 발굴한 신규 계정. 전부 Apify로 실존·공개 계정
--   확인 완료(2026-08-27).
--
--   clubs가 아니라 club_name_registry에 넣는다 — 이 12곳은 클럽 가이드/지도/
--   조각/깃발에 노출될 "클럽"이 아니라 라인업 수집만 필요한 venue다.
--   collect-club-events는 instagram_handle만 있으면 matched_club_id가
--   NULL이어도 수집 대상에 포함한다(index.ts:797-805 registryHandles 로직).
--
--   venue_type='venue' — 566에서 정의한 "공연장/라이브홀" 라벨. 클럽(테이블
--   예약 업장)이 아니라 파티/공연 venue라는 뜻.
--   웨스트브릿지 라이브홀, 성수율 뮤직은 조사했으나 제외:
--     - 웨스트브릿지: 공식 계정이 sja_music_institute(부설 실용음악학원)뿐,
--       파티/공연 라인업 공지 목적과 무관
--     - 성수율 뮤직: 2026-02 오픈 예정 K-POP 청음공간, DJ/래퍼 공연 취지와 결이 다름
-- ============================================================================

INSERT INTO club_name_registry (name_raw, normalized_name, area_guess, instagram_handle, venue_type, status)
VALUES
  ('LUVLUVLUV SEOUL', 'luvluvluvseoul', NULL, 'luvluvluv.seoul', 'venue', 'unmatched'),
  ('JJ Mahoney''s', 'jjmahoneys', '강남', 'jjmahoneys_seoul', 'venue', 'unmatched'),
  ('무신사개러지', '무신사개러지', NULL, 'musinsagarage', 'venue', 'unmatched'),
  ('Lowkey', 'lowkey', NULL, 'lowkeyseoul', 'venue', 'unmatched'),
  ('Space Brick', 'spacebrick', NULL, 'spacebrickkorea', 'venue', 'unmatched'),
  ('세븐즈', '세븐즈', '대전', 'sevens7_official_', 'venue', 'unmatched'),
  ('BUNKR02', 'bunkr02', NULL, 'bunkr02', 'venue', 'unmatched'),
  ('롤링홀', '롤링홀', '홍대', 'rollinghall', 'venue', 'unmatched'),
  ('RAP HOUSE', 'raphouse', NULL, 'rap_house_official', 'venue', 'unmatched'),
  ('Soyo', 'soyo', NULL, 'soyo.kr', 'venue', 'unmatched'),
  ('빌라레코드', '빌라레코드', NULL, 'villa_records_bar', 'venue', 'unmatched'),
  ('101 breaktime', '101breaktime', NULL, '101breaktime', 'venue', 'unmatched')
ON CONFLICT (name_raw) DO UPDATE SET
  instagram_handle = EXCLUDED.instagram_handle,
  venue_type = EXCLUDED.venue_type;
