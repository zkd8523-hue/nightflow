-- ============================================================================
-- Migration 604: lineup_sets.start_min 상한을 시간 변환 로직과 일치시킨다
-- 날짜: 2026-08-28
--
-- 증상:
--   08:01~08:59 사이에 시작하는 셋을 저장하면 23514로 거부된다.
--     new row for relation "lineup_sets" violates check constraint
--     "lineup_sets_start_min_check"
--   관리자 편집기 직접 입력(AdminLineupEditor)·포스터 Vision 파싱(parse.ts)
--   양쪽 경로에서 모두 재현된다.
--
-- 원인 — 코드와 DB의 경계값이 어긋나 있었다:
--   558이 start_min을 0~1560(= 06:00 기준 익일 08:00)으로 잡았는데,
--   src/lib/lineups/time.ts 의 toBusinessMinutes 는 LINEUP_NIGHT_END_HOUR=9 라
--   00:00~08:59 를 전부 "전날 밤의 연장"으로 +24 시프트한다. 그래서 08:30 은
--   (8+24-6)*60+30 = 1590 이 되어 상한 1560 을 넘는다.
--   같은 파일이 end_min 상한(1620 = 09:00)에 맞춰 설계됐다고 주석에 적혀 있는데,
--   start_min 쪽만 그 기준에서 빠져 있었다.
--
-- 결정 — 코드가 아니라 DB 제약을 넓힌다:
--   "08:30 시작 ~ 09:00 종료"는 실제로 존재하는 정상 라인업이다(클럽이 아침까지
--   운영). end_min 이 이미 1620(09:00)까지 허용하므로, start_min 만 08:00 에서
--   막는 건 근거 없는 비대칭이다. 상한을 1619(08:59)로 올려 "시작은 09:00 전,
--   종료는 09:00 까지"라는 일관된 규칙으로 맞춘다.
--   (1620 이 아니라 1619 인 이유: start_min == end_min 은 어차피
--    lineup_sets_time_order_chk 가 막으므로, 시작 상한은 09:00 직전까지가 맞다.)
--
-- ⚠️ 09:00 이후 시각은 이 마이그레이션의 범위가 아니다 — toBusinessMinutes 가
--    09:00 을 180(당일 낮)으로 되돌리는 설계라 DB 제약으로는 잡히지 않는다.
--    포스터에 09:00 이후 시작 셋이 나오면 값이 앞으로 튀므로 별도 대응이 필요하다.
-- ============================================================================

ALTER TABLE lineup_sets DROP CONSTRAINT IF EXISTS lineup_sets_start_min_check;

ALTER TABLE lineup_sets ADD CONSTRAINT lineup_sets_start_min_check
  CHECK (start_min IS NULL OR start_min BETWEEN 0 AND 1619);

COMMENT ON COLUMN lineup_sets.start_min IS
  '영업일 06:00 기준 경과 분. 0~1619 (06:00 ~ 익일 08:59). NULL 이면 시간 미표기 라인업(573). src/lib/lineups/time.ts 의 toBusinessMinutes 출력 범위와 일치해야 한다.';
