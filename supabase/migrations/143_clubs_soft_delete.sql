-- ============================================
-- Migration 143: Clubs Soft Delete
-- ============================================
-- 목적: auctions FK 보호하면서 클럽을 안전하게 비활성화
-- 배경: auctions.club_id가 NOT NULL + ON DELETE RESTRICT라
--       경매 이력이 있는 클럽은 hard delete 시 FK 위반 발생.
--       유저 입찰 이력/마이페이지 보존을 위해 soft delete 채택.
-- 참조: Migration 071 (user soft delete 패턴)
-- ============================================

-- 1. 컬럼 추가
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. 부분 인덱스 (활성/삭제됨 클럽 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_clubs_active
  ON clubs(created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_deleted
  ON clubs(deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- 3. 코멘트
COMMENT ON COLUMN clubs.deleted_at IS 'Soft delete timestamp. NULL = active. 어드민이 삭제 시 설정됨.';
COMMENT ON COLUMN clubs.deleted_by IS '삭제를 수행한 어드민 user_id (감사용).';
