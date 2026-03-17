-- MD 신청 시 플로어맵 필드 + Admin 승인 시 자동 클럽 생성

-- Step 1: users 테이블에 플로어맵 필드 추가
ALTER TABLE users ADD COLUMN floor_plan_url TEXT;
ALTER TABLE users ADD COLUMN table_positions JSONB DEFAULT '[]';

-- Step 2: MD 승인 시 클럽 자동 생성 함수
CREATE OR REPLACE FUNCTION auto_create_club_on_md_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- md_status가 approved로 변경되었을 때만
  IF NEW.md_status = 'approved' AND (OLD.md_status IS NULL OR OLD.md_status != 'approved') THEN
    -- verification_club_name이 있는지 확인
    IF NEW.verification_club_name IS NOT NULL THEN
      -- clubs 테이블에 자동 생성
      INSERT INTO clubs (
        md_id,
        name,
        address,
        address_detail,
        area,
        floor_plan_url,
        table_positions
      ) VALUES (
        NEW.id,
        NEW.verification_club_name,
        '', -- 빈 주소 (나중에 Admin 또는 MD가 수정)
        NULL,
        NEW.area::area_enum, -- users.area를 area enum으로 캐스팅
        NEW.floor_plan_url,
        COALESCE(NEW.table_positions, '[]'::jsonb)
      );

      -- default_club_id 설정 (첫 번째 클럽으로)
      UPDATE users
      SET default_club_id = (
        SELECT id FROM clubs WHERE md_id = NEW.id ORDER BY created_at ASC LIMIT 1
      )
      WHERE id = NEW.id AND default_club_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: 트리거 생성
DROP TRIGGER IF EXISTS trigger_auto_create_club ON users;
CREATE TRIGGER trigger_auto_create_club
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_club_on_md_approval();

COMMENT ON FUNCTION auto_create_club_on_md_approval IS 'MD 승인 시 clubs 테이블에 자동으로 클럽 생성 및 플로어맵 복사';
