-- 246: clubs.dresscode 컬럼 추가 + 파트너 RPC에 dresscode 지원
-- 드레스코드는 자유 텍스트 (예: "스니커즈 OK, 슬리퍼 X")

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS dresscode TEXT;

-- 파트너 MD가 dresscode도 수정할 수 있도록 RPC 확장
CREATE OR REPLACE FUNCTION update_club_partner_fields(
  p_club_id UUID,
  p_tags TEXT[] DEFAULT NULL,
  p_operating_hours TEXT DEFAULT NULL,
  p_dresscode TEXT DEFAULT NULL
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
    operating_hours  = COALESCE(p_operating_hours, operating_hours),
    dresscode        = COALESCE(p_dresscode, dresscode)
  WHERE id = p_club_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT, TEXT) TO authenticated;

-- 245의 3-arg 시그니처도 보존 (캐시 호환)
COMMENT ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT, TEXT) IS
  '파트너 MD/admin이 tags / operating_hours / dresscode 화이트리스트로 수정.';

-- dresscode 변경도 변경 이력에 자동 로깅
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
  IF NEW.dresscode IS DISTINCT FROM OLD.dresscode THEN
    INSERT INTO club_change_log (club_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'dresscode', to_jsonb(OLD.dresscode), to_jsonb(NEW.dresscode));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
