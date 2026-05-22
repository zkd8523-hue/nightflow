-- 218: clubs.operating_hours
-- 영업시간 자유 텍스트 (예: "금/토 22:00-05:00")
-- 기존 클럽 일괄 기본값 채움. 클럽별 차이는 admin이 개별 수정.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS operating_hours TEXT DEFAULT '금/토 22:00-05:00';

-- 기존 row에도 default 적용 (DEFAULT 절은 신규 INSERT만 적용)
UPDATE clubs
SET operating_hours = '금/토 22:00-05:00'
WHERE operating_hours IS NULL;
