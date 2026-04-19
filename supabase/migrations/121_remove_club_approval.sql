-- Migration 121: 클럽 승인 시스템 제거 + 1인당 최대 3개 제한
-- 승인 프로세스 폐지 (Admin이 직접 등록하므로 불필요)
-- 대신 MD 1인당 최대 3개 클럽으로 제한

-- 1. 기존 pending 클럽 모두 승인 처리 (트리거 우회)
ALTER TABLE clubs DISABLE TRIGGER enforce_critical_fields;
ALTER TABLE clubs DISABLE TRIGGER validate_status_change;
UPDATE clubs SET status = 'approved' WHERE status != 'approved';
ALTER TABLE clubs ENABLE TRIGGER enforce_critical_fields;
ALTER TABLE clubs ENABLE TRIGGER validate_status_change;

-- 2. status 기본값 변경 및 제약 단순화
ALTER TABLE clubs ALTER COLUMN status SET DEFAULT 'approved';
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS check_club_status;

-- 3. MD당 최대 3개 클럽 제한 트리거
CREATE OR REPLACE FUNCTION check_club_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM clubs WHERE md_id = NEW.md_id) >= 3 THEN
    RAISE EXCEPTION '클럽은 최대 3개까지 등록할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_club_limit ON clubs;
CREATE TRIGGER enforce_club_limit
  BEFORE INSERT ON clubs
  FOR EACH ROW EXECUTE FUNCTION check_club_limit();
