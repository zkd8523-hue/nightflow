-- ============================================================================
-- Migration 200: club_partners INSERT 정책 — MD가 본인 row 직접 등록 허용
-- 날짜: 2026-05-18
-- 설명:
--   Migration 174에서 club_partners RLS를 "Admins manage" 단일 정책으로 도입.
--   Migration 182가 clubs INSERT 시 자동 동기화 트리거(sync_club_to_partner)를
--   제거하면서, 코드(ClubForm.tsx, api/md/apply)가 직접 club_partners에 INSERT
--   하도록 전환됨. 그러나 Admin 전용 INSERT 정책 때문에 MD가 신규 클럽 등록 시
--   "new row violates row-level security policy for table club_partners" 오류 발생.
--
--   해결:
--     - MD/Admin이 본인(md_id = auth.uid()) row를 INSERT 가능하도록 정책 추가
--     - 기존 Admin 전용 ALL 정책은 유지(Admin은 임의 MD 대리 등록 가능)
-- ============================================================================

DROP POLICY IF EXISTS "MD can insert own club_partners" ON club_partners;
CREATE POLICY "MD can insert own club_partners" ON club_partners
  FOR INSERT TO authenticated
  WITH CHECK (
    md_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('md', 'admin')
    )
  );

-- MD가 본인 club_partners row를 삭제할 수 있도록 (클럽 탈퇴 / 등록 롤백 시 필요)
DROP POLICY IF EXISTS "MD can delete own club_partners" ON club_partners;
CREATE POLICY "MD can delete own club_partners" ON club_partners
  FOR DELETE TO authenticated
  USING (
    md_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('md', 'admin')
    )
  );
