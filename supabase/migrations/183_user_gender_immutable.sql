-- ============================================================================
-- Migration 183: users.gender 1회 설정 후 변경 불가 트리거
-- 날짜: 2026-05-16
--
-- 배경:
--   - 카카오 비즈앱 반려로 OAuth gender 자동 수집 불가 → 자체 입력으로 전환
--   - 클럽 합석 매칭에 성별 위장 시 트러스트 큰 이슈 → 변경 잠금 필요
--
-- 정책:
--   - NULL → 'male'/'female' 전환은 1회 허용 (가입/등록/합류 시점)
--   - 'male' ↔ 'female' 변경은 차단 (Admin은 직접 SQL로 우회 가능)
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_gender_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.gender IS NOT NULL
     AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    RAISE EXCEPTION 'users.gender cannot be changed once set (old=%, new=%)',
      OLD.gender, NEW.gender
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_gender_immutable ON users;

CREATE TRIGGER trg_users_gender_immutable
  BEFORE UPDATE OF gender ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_gender_immutable();

COMMENT ON FUNCTION enforce_gender_immutable() IS
  'users.gender는 NULL에서 male/female로 1회 전환만 허용. 변경 시도는 차단.';
