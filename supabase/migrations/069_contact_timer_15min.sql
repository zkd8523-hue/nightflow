-- 연락 타이머 20분 → 15분 변경
-- 근거: 소멸성 재고(클럽 테이블)에는 빠른 연락 회전이 유리

CREATE OR REPLACE FUNCTION calculate_contact_timer(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  RETURN 15;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_contact_timer(UUID) IS '연락 타이머: 15분 단일 (2026-03-16)';
