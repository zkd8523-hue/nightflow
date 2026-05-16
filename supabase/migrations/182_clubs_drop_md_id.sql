-- ============================================================================
-- Migration 182: clubs.md_id 컬럼 제거 (Phase 4)
-- 선결 조건:
--   Phase 3(Migration 178) + Phase 2(Migration 181) 완료 후
--   코드(admin/clubs/page, AdminClubsList, types)가 club_partners 기반으로 전환됨.
-- ⚠️ 실행 전: api/md/apply + ClubForm 에서 clubs INSERT 시 md_id 필드 제거 커밋 필요.
-- ============================================================================

BEGIN;

-- 1. 백업 (컬럼 DROP 전 데이터 보존)
DROP TABLE IF EXISTS clubs_md_id_backup_phase4;
CREATE TABLE clubs_md_id_backup_phase4 AS
  SELECT id, md_id FROM clubs WHERE md_id IS NOT NULL;
ALTER TABLE clubs_md_id_backup_phase4 ENABLE ROW LEVEL SECURITY;

-- 2. md_id 기반 RLS 정책 DROP (clubs.md_id 참조하는 모든 정책)
DROP POLICY IF EXISTS "MD can create pending clubs" ON clubs;
DROP POLICY IF EXISTS "MD can update own pending clubs" ON clubs;
DROP POLICY IF EXISTS "MD can delete own pending clubs" ON clubs;
DROP POLICY IF EXISTS "MD via club_partners can update clubs" ON clubs;
DROP POLICY IF EXISTS "MD can update own approved clubs" ON clubs;
DROP POLICY IF EXISTS "MD can update own approved club images" ON clubs;

-- 3. 새 RLS 정책: md_id 대신 role 기반 (INSERT 허용 후 코드가 club_partners INSERT)
CREATE POLICY "MD can create clubs" ON clubs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- 4. club_partners 기반 UPDATE 정책 (178 에서 추가했던 것 재확인)
CREATE POLICY "MD via club_partners can update clubs" ON clubs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_partners cp
      WHERE cp.club_id = clubs.id AND cp.md_id = auth.uid()
    )
    AND status IN ('pending', 'rejected')
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- 5. 갭 방어 트리거 DROP (코드가 직접 club_partners INSERT 하므로 불필요)
DROP TRIGGER IF EXISTS after_club_insert_sync_partner ON clubs;
DROP FUNCTION IF EXISTS sync_club_to_partner();

-- 6. check_club_limit 트리거 — 이미 Migration 178 에서 club_partners 기반으로 수정됨.
--    clubs.md_id IS NULL 케이스: NEW.md_id = NULL 이므로 함수 내 early return 처리됨.
--    별도 수정 불필요.

-- 7. clubs.md_id FK constraint DROP (컬럼 DROP 전 필수)
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_md_id_fkey;

-- 8. clubs.md_id 컬럼 DROP
ALTER TABLE clubs DROP COLUMN IF EXISTS md_id;

COMMIT;

-- ============================================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================================
-- (1) 컬럼 제거 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clubs' AND column_name = 'md_id';
--   -- 0행 이어야 정상
--
-- (2) club_partners 데이터 무결성
--   SELECT u.id, u.display_name FROM users u
--   WHERE u.md_status='approved' AND u.deleted_at IS NULL
--     AND NOT EXISTS (SELECT 1 FROM club_partners cp WHERE cp.md_id = u.id);
--   -- 0건 이어야 정상 (테스트 계정 제외)
--
-- 1~2주 안정화 후 백업 테이블 정리:
--   DROP TABLE IF EXISTS clubs_md_id_backup_phase4;
--   DROP TABLE IF EXISTS clubs_backup_phase2;
--   DROP TABLE IF EXISTS club_partners_backup_phase2;
--   DROP TABLE IF EXISTS auctions_clubid_backup_phase2;
--   DROP TABLE IF EXISTS auction_templates_clubid_backup_phase2;
--   DROP TABLE IF EXISTS puzzle_offers_clubid_backup_phase2;
--   DROP TABLE IF EXISTS user_favorite_clubs_backup_phase2;
--   DROP TABLE IF EXISTS users_default_club_backup_phase2;
