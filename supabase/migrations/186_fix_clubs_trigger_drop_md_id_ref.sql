-- Migration 186: clubs 트리거에서 md_id 참조 제거
-- 배경: Migration 182에서 clubs.md_id 컬럼을 DROP했으나
--       prevent_critical_field_changes() 트리거 함수가 여전히
--       NEW.md_id / OLD.md_id를 참조 → clubs 테이블 UPDATE 전체 실패 (500)

CREATE OR REPLACE FUNCTION prevent_critical_field_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- status 변경은 Admin만 (md_id는 182에서 DROP됐으므로 체크 제거)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'status 변경은 관리자만 가능합니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
