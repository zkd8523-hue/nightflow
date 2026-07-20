-- ============================================================
-- Migration 473: phone UNIQUE에서 테스트 번호 제외
-- ------------------------------------------------------------
-- 테스트 계정을 여러 개 만들 때 같은 번호(01000000000)를 재사용하는데
-- idx_users_unique_phone(124)에 걸려 가입이 막혔다.
--   duplicate key value violates unique constraint "idx_users_unique_phone"
--
-- ⚠️ is_test 조건만으로는 안 된다. users.is_test는 DEFAULT false라
--    갓 가입한 테스트 계정은 아직 마킹되지 않은 상태이기 때문.
--    그래서 "테스트 전용 더미 번호" 자체를 인덱스에서 뺀다.
--
-- 실계정 1인 1계정은 그대로 유지된다 (더미 번호가 아닌 이상 전부 유니크).
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================

DROP INDEX IF EXISTS public.idx_users_unique_phone;

CREATE UNIQUE INDEX idx_users_unique_phone
  ON public.users(phone)
  WHERE phone IS NOT NULL
    AND deleted_at IS NULL
    AND is_test = FALSE
    -- 테스트 더미 번호 (하이픈 유무 둘 다)
    AND phone NOT IN ('01000000000', '010-0000-0000');

COMMENT ON INDEX public.idx_users_unique_phone IS
  '1인 1계정 강제. 탈퇴(deleted_at)·테스트 계정(is_test)·테스트 더미 번호(01000000000)는 제외.';
