-- Migration 079: MD 승인 게이트 제거
-- MD 가입 시 즉시 활동 가능 (pending → approved 일괄 전환)
-- suspended/revoked 제재 시스템은 유지

-- 기존 pending MD → approved
UPDATE users SET md_status = 'approved' WHERE md_status = 'pending';

-- 기존 pending 클럽 → approved (MD 가입 시 생성된 것들)
UPDATE clubs SET status = 'approved' WHERE status = 'pending';
