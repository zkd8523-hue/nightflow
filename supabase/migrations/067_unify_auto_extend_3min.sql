-- 067: 전 경매 auto_extend_min 3분 통일
-- 날짜: 2026-03-15
-- 근거: 모바일 반응 시간(10-20초) 대비 3분 충분, MD 대기 시간 40% 감소
-- 변경: 15분 초과 경매도 5분→3분, 최대 연장 +15분→+9분

-- 1. 기본값 3분으로 변경
ALTER TABLE auctions ALTER COLUMN auto_extend_min SET DEFAULT 3;

-- 2. 기존 5분 경매 → 3분으로 업데이트
UPDATE auctions SET auto_extend_min = 3 WHERE auto_extend_min = 5;

-- 3. 트리거 교체: duration 무관하게 항상 3분
CREATE OR REPLACE FUNCTION set_auto_extend_by_duration()
RETURNS TRIGGER AS $$
BEGIN
  NEW.auto_extend_min := 3;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_auto_extend_by_duration() IS '경매 연장 시간 3분 통일 (Migration 067)';
