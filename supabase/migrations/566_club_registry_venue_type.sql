-- ============================================================================
-- Migration 566: club_name_registry / club_events — venue_type 라벨 추가
-- 날짜: 2026-08-26
-- 배경:
--   미등록 클럽 발굴 목록(club_name_registry)에 스페이스브릭 같은 "라이브 공연장"이
--   섞여 나옴 — 클럽(테이블/주류 예약 업장)이 아닌데 클럽 등록 후보처럼 보임
--   (실측: 인스타 프로필에 "라이브 음악 공연장" 명시).
--   힙합플레이야 캘린더는 클럽 파티/공연장 대관/호텔 풀파티/콘서트홀을
--   구분 없이 다룬다 — venue_type으로 라벨링해 발굴 화면에서 걸러본다.
--
--   값: 'club'(클럽/라운지) | 'venue'(공연장/라이브홀/콘서트홀) | 'other'(그 외) |
--       NULL(기존 데이터·미분류)
--   분류는 LLM 파싱 단계(collect-club-events)에서 캡션 문맥으로 추정.
--   확신 없으면 NULL로 두고 화면에서 사람이 보고 넘김 — 오분류로 클럽을
--   공연장 취급해 걸러버리는 게 더 나쁨.
-- ============================================================================

ALTER TABLE club_name_registry ADD COLUMN IF NOT EXISTS venue_type TEXT
  CHECK (venue_type IN ('club', 'venue', 'other'));

ALTER TABLE club_events ADD COLUMN IF NOT EXISTS venue_type TEXT
  CHECK (venue_type IN ('club', 'venue', 'other'));

COMMENT ON COLUMN club_name_registry.venue_type IS
  'club=테이블/주류 예약 업장, venue=공연장/라이브홀, other=그 외(호텔풀파티 등). NULL=미분류.';
