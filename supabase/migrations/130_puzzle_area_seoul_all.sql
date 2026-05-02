-- puzzles.area CHECK 제약에 "서울 어디든" 추가
-- PuzzleForm에서 사용자가 선택할 수 있는 옵션이지만 DB CHECK가 거부하던 문제 해결

ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_area_check;

ALTER TABLE puzzles ADD CONSTRAINT puzzles_area_check
  CHECK (area IN (
    '서울 어디든',
    '강남', '홍대', '이태원', '건대',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  ));
