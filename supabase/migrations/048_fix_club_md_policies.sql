-- ============================================
-- Migration 048: MD 클럽 RLS 정책 보정
-- ============================================
-- 목적: MD가 자신의 클럽을 등록/수정/삭제 가능하도록 허용
-- INSERT: pending 상태로만 생성 가능 (046 정책 보정)
-- UPDATE/DELETE: pending/rejected만 가능
-- approved 클럽은 Admin만 변경 가능
-- ============================================

-- ============================================
-- 1. INSERT 정책 보정 (046에서 누락되었을 수 있음)
-- ============================================
DROP POLICY IF EXISTS "MD can create pending clubs" ON clubs;

CREATE POLICY "MD can create pending clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = md_id
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- Admin INSERT 정책도 보정
DROP POLICY IF EXISTS "Admins can insert clubs" ON clubs;

CREATE POLICY "Admins can insert clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 2. UPDATE 정책 추가 (MD용)
-- ============================================
DROP POLICY IF EXISTS "MD can update own pending clubs" ON clubs;

CREATE POLICY "MD can update own pending clubs"
  ON clubs FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = md_id
    AND status IN ('pending', 'rejected')
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- ============================================
-- 3. DELETE 정책 추가 (MD용)
-- ============================================
DROP POLICY IF EXISTS "MD can delete own pending clubs" ON clubs;

CREATE POLICY "MD can delete own pending clubs"
  ON clubs FOR DELETE
  TO authenticated
  USING (
    auth.uid() = md_id
    AND status IN ('pending', 'rejected')
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );
