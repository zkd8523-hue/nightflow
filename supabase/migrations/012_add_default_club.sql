-- 기본 클럽 설정 기능
-- MD가 여러 클럽에 소속되어 있을 때 기본 클럽을 미리 설정

ALTER TABLE users ADD COLUMN default_club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX idx_users_default_club ON users(default_club_id);

-- 기본 클럽 설정 함수 (MD만 자신의 소속 클럽 중 하나를 기본으로 설정 가능)
CREATE OR REPLACE FUNCTION set_default_club(p_club_id UUID)
RETURNS json AS $$
DECLARE
  v_user_id UUID;
  v_is_md_club BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  -- 빈 값 허용 (기본 클럽 해제)
  IF p_club_id IS NULL THEN
    UPDATE users SET default_club_id = NULL WHERE id = v_user_id;
    RETURN json_build_object('success', true, 'message', '기본 클럽이 해제되었습니다');
  END IF;

  -- MD가 해당 클럽에 소속되어 있는지 확인
  SELECT EXISTS(
    SELECT 1 FROM clubs WHERE id = p_club_id AND md_id = v_user_id
  ) INTO v_is_md_club;

  IF NOT v_is_md_club THEN
    RETURN json_build_object('success', false, 'message', '본인이 소속된 클럽만 기본 클럽으로 설정할 수 있습니다');
  END IF;

  -- 기본 클럽 설정
  UPDATE users SET default_club_id = p_club_id WHERE id = v_user_id;

  RETURN json_build_object('success', true, 'message', '기본 클럽이 설정되었습니다');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
