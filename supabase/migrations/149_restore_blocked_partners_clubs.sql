-- ========================================
-- Migration 149: 통합으로 클럽 잃은 파트너 8명의 본인 명의 클럽 행 복원 (D안)
-- ========================================
-- 배경:
--   merge_clubs(145)가 default_club_id만 target으로 이전하고 clubs.md_id는
--   재연결하지 않아 source 클럽 명의자(파트너)들이 본인 명의 active 클럽 0개로 남음.
--   각 파트너의 soft-deleted 본인 행을 그대로 복원하면서 name만 target과 동일하게
--   통일 → 본인이 등록한 자산(썸네일/플로어플랜/테이블배치/주소/좌표) 손실 0.
--
-- Trade-off:
--   같은 venue가 여러 행으로 다시 살아남(예: BERMUDA 1→4행).
--   본질 정리는 별도 작업(B안: club_partners join 테이블)으로 분리.
--
-- Idempotent:
--   1차 적용 후에는 deleted_at IS NULL이라 WHERE 조건이 매칭되지 않아 재실행 NOOP.
-- ========================================

-- 1. BLOCKED 파트너의 deleted 본인 행 복원 + name을 default_club_id가 가리키는 target과 동일화
UPDATE clubs c_self
SET
    deleted_at = NULL,
    deleted_by = NULL,
    name = c_target.name
FROM users u
JOIN clubs c_target ON c_target.id = u.default_club_id
WHERE c_self.md_id = u.id
  AND c_self.deleted_at IS NOT NULL
  AND u.role = 'md'
  AND u.md_status = 'approved'
  AND c_target.deleted_at IS NULL
  AND c_target.md_id IS DISTINCT FROM u.id
  AND NOT EXISTS (
    SELECT 1 FROM clubs c2
    WHERE c2.md_id = u.id AND c2.deleted_at IS NULL
  );

-- 2. 영향 MD의 default_club_id를 본인 명의 active 클럽으로 갱신
--    (BLOCKED은 1번에서 막 복원된 행, CONFUSED는 기존 본인 active 행)
UPDATE users u
SET default_club_id = (
    SELECT c.id FROM clubs c
    WHERE c.md_id = u.id AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 1
)
WHERE u.role = 'md'
  AND u.md_status = 'approved'
  AND u.default_club_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM clubs c_def
    WHERE c_def.id = u.default_club_id
      AND c_def.md_id IS DISTINCT FROM u.id
  )
  AND EXISTS (
    SELECT 1 FROM clubs c2
    WHERE c2.md_id = u.id AND c2.deleted_at IS NULL
  );
