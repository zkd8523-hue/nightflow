-- ================================
-- Admin 테스트 권한 설정
-- ================================
-- 어드민 계정도 MD 기능 (경매 등록/수정/삭제)을 테스트할 수 있도록 RLS 정책 수정

-- 1. 기존 "MD can create auctions" 정책 삭제 후 재생성
DROP POLICY IF EXISTS "MD can create auctions" ON auctions;

CREATE POLICY "MD and Admin can create auctions" ON auctions
  FOR INSERT WITH CHECK (
    auth.uid() = md_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        (role = 'md' AND md_status = 'approved')
        OR role = 'admin'
      )
    )
  );

-- 2. 업데이트/삭제 정책은 이미 md_id 체크만 하므로 admin이 md_id로 등록했다면 자동으로 허용됨
-- 추가 수정 불필요

-- 3. 주석: Admin이 경매 등록 시 md_id를 본인 UUID로 설정하면 됨
