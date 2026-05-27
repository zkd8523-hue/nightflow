-- 245: 파트너 MD 클럽 정보 즉시 편집 + 변경 이력
-- 파트너 MD가 본인 클럽의 tags / operating_hours 두 필드를 즉시 수정 가능
-- 모든 변경은 club_change_log에 자동 기록 (admin 사후 모니터링/롤백)

-- (1) 변경 이력 테이블
CREATE TABLE IF NOT EXISTS club_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_change_log_club ON club_change_log(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_change_log_by ON club_change_log(changed_by);

ALTER TABLE club_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/partner can view club log" ON club_change_log;
CREATE POLICY "Admin/partner can view club log" ON club_change_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM club_partners WHERE club_id = club_change_log.club_id AND md_id = auth.uid())
  );

-- (2) tags / operating_hours 변경 시 자동 로그 트리거
CREATE OR REPLACE FUNCTION log_club_field_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tags IS DISTINCT FROM OLD.tags THEN
    INSERT INTO club_change_log (club_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'tags', to_jsonb(OLD.tags), to_jsonb(NEW.tags));
  END IF;
  IF NEW.operating_hours IS DISTINCT FROM OLD.operating_hours THEN
    INSERT INTO club_change_log (club_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'operating_hours', to_jsonb(OLD.operating_hours), to_jsonb(NEW.operating_hours));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_club_field_change ON clubs;
CREATE TRIGGER trg_log_club_field_change
  AFTER UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION log_club_field_change();

-- (3) 파트너 MD가 tags/operating_hours만 UPDATE 가능한 RPC (화이트리스트 방식)
CREATE OR REPLACE FUNCTION update_club_partner_fields(
  p_club_id UUID,
  p_tags TEXT[] DEFAULT NULL,
  p_operating_hours TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_is_partner BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role = 'admin' INTO v_is_admin FROM users WHERE id = v_md_id;
  SELECT EXISTS(SELECT 1 FROM club_partners WHERE club_id = p_club_id AND md_id = v_md_id)
    INTO v_is_partner;

  IF NOT (COALESCE(v_is_admin, false) OR COALESCE(v_is_partner, false)) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
  END IF;

  UPDATE clubs SET
    tags             = COALESCE(p_tags, tags),
    operating_hours  = COALESCE(p_operating_hours, operating_hours)
  WHERE id = p_club_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT) TO authenticated;

COMMENT ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT) IS
  '파트너 MD/admin이 tags 및/또는 operating_hours 만 화이트리스트로 수정. 변경은 트리거로 자동 로깅.';
