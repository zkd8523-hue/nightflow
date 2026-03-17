-- Fix: users.area CHECK 제약조건 확장
-- 기존 ('강남', '홍대', '이태원')만 허용 → 폼 UI에서 제공하는 모든 지역 허용
-- MDApplyForm에서 건대/부산/대구 등 선택 시 UPDATE 실패하던 문제 수정

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_area_check;

ALTER TABLE users ADD CONSTRAINT users_area_check
  CHECK (area IN ('강남', '홍대', '이태원', '건대', '부산', '대구', '인천', '광주', '대전', '울산', '세종'));
