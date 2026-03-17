-- ============================================
-- Migration 046: Club Approval System (Option A)
-- ============================================
-- 목적: MD의 다중 클럽 지원 + Admin 승인 워크플로우
-- 전략: Migration 006 RLS 유지 + 트리거 기반 보안 강화
-- ============================================

-- ============================================
-- Phase 1: 스키마 변경
-- ============================================

-- 1-1. status 컬럼 추가 (pending/approved/rejected)
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1-2. CHECK 제약조건 (status 유효값)
DO $$ BEGIN
  ALTER TABLE clubs ADD CONSTRAINT check_club_status
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1-3. 승인 관련 컬럼
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN approved_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1-5. 거부 관련 컬럼
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN rejected_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN rejected_by UUID REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN rejected_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1-6. 거부 시 사유 필수 (rejected_reason 컬럼 생성 후)
DO $$ BEGIN
  ALTER TABLE clubs ADD CONSTRAINT check_rejected_reason
    CHECK (status != 'rejected' OR rejected_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1-7. 승인 이력 추적
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN first_approved_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN last_approved_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1-8. Optimistic Locking용 version 컬럼
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1-9. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_clubs_status ON clubs(status);
CREATE INDEX IF NOT EXISTS idx_clubs_md_status ON clubs(md_id, status);
CREATE INDEX IF NOT EXISTS idx_clubs_version ON clubs(version);

-- ============================================
-- Phase 2: 기존 데이터 Backfill
-- ============================================

-- 기존 클럽은 모두 승인된 것으로 간주
UPDATE clubs
SET
  status = 'approved',
  approved_at = created_at,
  first_approved_at = created_at,
  last_approved_at = created_at
WHERE status = 'pending';

-- ============================================
-- Phase 3: 트리거 (보안 강화)
-- ============================================

-- 트리거 1: status/md_id 변경은 Admin만
CREATE OR REPLACE FUNCTION prevent_critical_field_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- status 변경은 Admin만
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'status 변경은 관리자만 가능합니다';
    END IF;
  END IF;

  -- md_id 변경도 Admin만
  IF NEW.md_id IS DISTINCT FROM OLD.md_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'md_id 변경은 관리자만 가능합니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_critical_fields ON clubs;
CREATE TRIGGER enforce_critical_fields
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_field_changes();

-- 트리거 2: 상태 전이 검증
CREATE OR REPLACE FUNCTION validate_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- approved → rejected 차단 (진행 중인 경매 보호)
  IF OLD.status = 'approved' AND NEW.status = 'rejected' THEN
    IF EXISTS (
      SELECT 1 FROM auctions
      WHERE club_id = NEW.id AND status IN ('active', 'scheduled')
    ) THEN
      RAISE EXCEPTION '진행 중인 경매가 있는 클럽은 거부할 수 없습니다';
    END IF;
  END IF;

  -- 승인 이력 추적
  IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
    IF NEW.first_approved_at IS NULL THEN
      NEW.first_approved_at := now();
    END IF;
    NEW.last_approved_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_status_change ON clubs;
CREATE TRIGGER validate_status_change
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION validate_status_transition();

-- 트리거 3: Optimistic Locking (version 자동 증가)
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.* IS DISTINCT FROM NEW.* THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clubs_increment_version ON clubs;
CREATE TRIGGER clubs_increment_version
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION increment_version();

-- ============================================
-- Phase 4: RLS 정책 수정 (MD 신청 허용)
-- ============================================

-- Migration 006의 "Admins can insert clubs" 정책 제거
DROP POLICY IF EXISTS "Admins can insert clubs" ON clubs;

-- MD가 자신의 클럽을 pending 상태로 신청 가능
CREATE POLICY "MD can create pending clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = md_id
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'md')
  );

-- Admin은 모든 상태로 클럽 생성 가능
CREATE POLICY "Admins can insert clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- Phase 5: 설명 추가
-- ============================================

COMMENT ON COLUMN clubs.status IS 'pending: 승인 대기, approved: 승인 완료, rejected: 거부됨';
COMMENT ON COLUMN clubs.version IS 'Optimistic Locking용 버전 번호 (동시 수정 방지)';
COMMENT ON COLUMN clubs.first_approved_at IS '최초 승인 시각 (이력 추적)';
COMMENT ON COLUMN clubs.last_approved_at IS '마지막 승인 시각 (재승인 시 갱신)';
