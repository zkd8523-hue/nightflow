-- ============================================
-- Migration 049: 승인된 클럽 이미지 수정 허용
-- ============================================
-- 목적: MD가 승인된 클럽의 대표이미지/플로어맵만 수정 가능
-- 기본 정보(이름, 주소, 지역 등)는 여전히 Admin만 변경 가능
-- ============================================

-- ============================================
-- 1. RLS 정책: MD가 승인된 자기 클럽 UPDATE 허용
-- ============================================
-- 기존 "MD can update own pending clubs" (048)은 pending/rejected만 허용
-- 이 정책은 approved 클럽에 대한 UPDATE 접근을 허용
-- 실제 필드 제한은 트리거에서 처리

DROP POLICY IF EXISTS "MD can update own approved club images" ON clubs;

CREATE POLICY "MD can update own approved club images"
  ON clubs FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = md_id
    AND status = 'approved'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- ============================================
-- 2. 트리거: 승인 클럽 비이미지 필드 변경 차단
-- ============================================
-- approved 클럽에서 MD는 아래 필드만 변경 가능:
--   thumbnail_url, floor_plan_url, table_positions
-- 나머지 필드 변경 시도 시 예외 발생
-- Admin은 모든 필드 변경 가능

CREATE OR REPLACE FUNCTION prevent_locked_field_changes_on_approved()
RETURNS TRIGGER AS $$
BEGIN
  -- approved가 아닌 클럽은 제한 없음
  IF OLD.status != 'approved' THEN
    RETURN NEW;
  END IF;

  -- Admin은 모든 필드 변경 가능
  IF EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- MD: 잠긴 필드 변경 차단
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION '승인된 클럽의 이름은 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.area IS DISTINCT FROM OLD.area THEN
    RAISE EXCEPTION '승인된 클럽의 지역은 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.address IS DISTINCT FROM OLD.address THEN
    RAISE EXCEPTION '승인된 클럽의 주소는 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.address_detail IS DISTINCT FROM OLD.address_detail THEN
    RAISE EXCEPTION '승인된 클럽의 상세주소는 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN
    RAISE EXCEPTION '승인된 클럽의 우편번호는 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.latitude IS DISTINCT FROM OLD.latitude THEN
    RAISE EXCEPTION '승인된 클럽의 좌표는 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    RAISE EXCEPTION '승인된 클럽의 좌표는 관리자만 변경할 수 있습니다';
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION '승인된 클럽의 연락처는 관리자만 변경할 수 있습니다';
  END IF;

  -- thumbnail_url, floor_plan_url, table_positions 변경은 허용
  -- status, md_id는 기존 prevent_critical_field_changes() 트리거에서 차단

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_approved_club_locked_fields ON clubs;
CREATE TRIGGER enforce_approved_club_locked_fields
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_field_changes_on_approved();
