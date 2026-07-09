-- 436: puzzles.area CHECK 제약에 '수원' 추가
-- 배경: 2026-07-09 수원 지역 오픈했으나 puzzles_area_check(Migration 130)에
--      수원이 없어서 깃발/조각 등록 시 "violates check constraint puzzles_area_check" 에러.
--      Migration 426이 clubs/users만 추가하고 puzzles는 놓침.
-- 목록은 130 그대로 유지 + '수원' 삽입.

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_area_check;

ALTER TABLE puzzles ADD CONSTRAINT puzzles_area_check
  CHECK (area IN (
    '서울 어디든',
    '강남', '홍대', '이태원', '건대', '수원',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));
