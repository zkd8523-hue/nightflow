-- Migration 055: 경매 시간별 자동 연장 시간 차등 적용
-- 날짜: 2026-03-10
-- 규칙: 15분 경매 → 3분×3회, 나머지 → 5분×3회
-- 방법: DB 트리거로 자동 설정 (MD 설정 부담 제거)

-- 1. 기본값 5분으로 변경 (30분/60분 경매 대응)
ALTER TABLE auctions ALTER COLUMN auto_extend_min SET DEFAULT 5;

-- 2. 기존 15분 초과 경매 업데이트
UPDATE auctions SET auto_extend_min = 5
WHERE duration_minutes > 15 AND auto_extend_min = 3;

-- 3. 경매 생성 시 duration_minutes 기반 auto_extend_min 자동 설정
CREATE OR REPLACE FUNCTION set_auto_extend_by_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.duration_minutes <= 15 THEN
    NEW.auto_extend_min := 3;
  ELSE
    NEW.auto_extend_min := 5;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_extend_by_duration
  BEFORE INSERT ON auctions
  FOR EACH ROW EXECUTE FUNCTION set_auto_extend_by_duration();

COMMENT ON FUNCTION set_auto_extend_by_duration() IS '경매 시간별 연장 시간 자동 설정: <=15분→3분, >15분→5분';
