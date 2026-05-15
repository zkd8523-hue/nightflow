-- ============================================================================
-- Migration 174: club_partners 조인 테이블 도입 (Phase 1)
-- 날짜: 2026-05-16
-- 설명:
--   클럽-MD 다대다 구조 전환을 위한 첫 단계.
--   기존 clubs.md_id 단일 소유 구조 → club_partners 조인으로 확장.
--
--   Phase 1 (이번): 새 테이블 + 백필 + 갭 방어 트리거. clubs.md_id 유지(양립).
--   Phase 3 (다음): RLS/코드 전환 (clubs.md_id와 양립).
--   Phase 2 (마지막): 같은 (name, area) 중복 머지.
--
--   ⚠️ Phase 순서 [1 → 3 → 2]: Phase 2 머지를 코드 전환 전에 하면
--   기존 코드가 clubs.md_id로 조회하면서 deleted MD 클럽이 화면에서 증발함.
-- ============================================================================

-- 1) club_partners 테이블 생성
CREATE TABLE IF NOT EXISTS club_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'partner')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, md_id)
);

CREATE INDEX IF NOT EXISTS idx_club_partners_club ON club_partners(club_id);
CREATE INDEX IF NOT EXISTS idx_club_partners_md ON club_partners(md_id);
CREATE INDEX IF NOT EXISTS idx_club_partners_md_role ON club_partners(md_id, role);

-- 2) RLS 활성화 + 정책
ALTER TABLE club_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read club_partners" ON club_partners;
CREATE POLICY "Anyone read club_partners" ON club_partners
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage club_partners" ON club_partners;
CREATE POLICY "Admins manage club_partners" ON club_partners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 3) 기존 clubs.md_id → club_partners 백필
INSERT INTO club_partners (club_id, md_id, role)
SELECT id, md_id, 'owner'
FROM clubs
WHERE md_id IS NOT NULL
  AND deleted_at IS NULL
ON CONFLICT (club_id, md_id) DO NOTHING;

-- 4) 갭 방어 트리거: clubs INSERT 시 club_partners 자동 동기화
--    Phase 1 ~ Phase 3 사이에 옛 코드가 clubs만 INSERT해도 자동으로 동기화됨
CREATE OR REPLACE FUNCTION sync_club_to_partner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.md_id IS NOT NULL THEN
    INSERT INTO club_partners (club_id, md_id, role)
    VALUES (NEW.id, NEW.md_id, 'owner')
    ON CONFLICT (club_id, md_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS after_club_insert_sync_partner ON clubs;
CREATE TRIGGER after_club_insert_sync_partner
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION sync_club_to_partner();

-- 5) updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_club_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS club_partners_updated_at ON club_partners;
CREATE TRIGGER club_partners_updated_at
  BEFORE UPDATE ON club_partners
  FOR EACH ROW
  EXECUTE FUNCTION update_club_partners_updated_at();
