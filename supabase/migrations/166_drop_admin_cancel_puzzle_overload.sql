-- ============================================================================
-- Migration 166: admin_cancel_puzzle — 기존 (UUID) overload 제거
-- 날짜: 2026-05-15
-- 설명:
--   Migration 165에서 admin_cancel_puzzle(p_puzzle_id UUID, p_reason TEXT)
--   시그니처를 추가했지만, 154의 admin_cancel_puzzle(p_puzzle_id UUID) 함수가
--   그대로 남아 있어 PostgREST가 함수를 호출할 때 overload 모호성이 발생할
--   수 있다. 165 시그니처만 남기기 위해 1-arg 버전을 명시적으로 제거한다.
-- ============================================================================

DROP FUNCTION IF EXISTS admin_cancel_puzzle(UUID);

-- 165 함수는 그대로 유지: admin_cancel_puzzle(UUID, TEXT DEFAULT NULL)
-- 클라이언트는 항상 (p_puzzle_id, p_reason) 두 파라미터로 호출.
-- 사유 미입력 시 p_reason = null 전달 → 기본 메시지 사용.
