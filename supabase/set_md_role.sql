-- 닉네임 "123123" 유저를 MD 역할로 변경
-- 일회성 데이터 수정 (스키마 변경 아님 → 마이그레이션 번호 미부여)
-- Supabase 대시보드 SQL Editor에서 수동 실행

DO $$
DECLARE
  v_count    INTEGER;
  v_user_id  UUID;
  v_old_role TEXT;
BEGIN
  -- 1) 대상 조회 (display_name은 LOWER() 기준 비교 정책 준수)
  SELECT count(*) INTO v_count
  FROM users
  WHERE lower(display_name) = lower('123123')
    AND deleted_at IS NULL;          -- soft delete 된 계정 제외

  IF v_count = 0 THEN
    RAISE EXCEPTION '닉네임 "123123" 유저를 찾을 수 없습니다.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION '닉네임 "123123" 유저가 % 명입니다. 수동 확인 필요 (id로 직접 지정하세요).', v_count;
  END IF;

  -- 2) 단일 매칭 확정 후 업데이트
  SELECT id, role INTO v_user_id, v_old_role
  FROM users
  WHERE lower(display_name) = lower('123123')
    AND deleted_at IS NULL;

  UPDATE users
  SET role = 'md'
  WHERE id = v_user_id;

  RAISE NOTICE '완료: user_id=% / role: % → md', v_user_id, v_old_role;
END $$;
