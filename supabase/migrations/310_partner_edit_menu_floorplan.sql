-- 310: 파트너 MD가 "클럽 정보 수정하기" 시트에서
--      가격표(drink_menu)·테이블맵(floor_plan) 사진을 직접 수정할 수 있게 확장
--
-- 1) update_club_partner_fields RPC 확장: drink_menu_urls + floor_plan_urls 화이트리스트 추가
-- 2) club-menus 스토리지 버킷에 파트너 MD 업로드/수정/삭제 허용 (자기 클럽 폴더 ${club_id}/... 만)
--    ※ 테이블맵 이미지는 auction-images 버킷(floor-plans/club/...)을 사용 → 이미 인증 MD 업로드 허용됨

-- 기존 3-arg / 4-arg 시그니처 제거 (PostgREST 오버로드 모호성 PGRST203 방지)
DROP FUNCTION IF EXISTS update_club_partner_fields(UUID, TEXT[], TEXT);
DROP FUNCTION IF EXISTS update_club_partner_fields(UUID, TEXT[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION update_club_partner_fields(
  p_club_id UUID,
  p_tags TEXT[] DEFAULT NULL,
  p_operating_hours TEXT DEFAULT NULL,
  p_dresscode TEXT DEFAULT NULL,
  p_drink_menu_urls TEXT[] DEFAULT NULL,
  p_floor_plan_urls TEXT[] DEFAULT NULL
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

  -- NULL = 미변경(기존 유지). 빈 배열 '{}' = 전체 삭제(명시적 변경).
  -- COALESCE는 빈 배열을 NULL로 보지 않으므로 "전부 지우기"도 정상 반영됨.
  UPDATE clubs SET
    tags                  = COALESCE(p_tags, tags),
    operating_hours       = COALESCE(p_operating_hours, operating_hours),
    dresscode             = COALESCE(p_dresscode, dresscode),
    drink_menu_urls       = COALESCE(p_drink_menu_urls, drink_menu_urls),
    -- 하위 호환: 단일 컬럼에 첫 번째 URL 미러링 (빈 배열이면 NULL)
    drink_menu_url        = CASE WHEN p_drink_menu_urls IS NOT NULL THEN p_drink_menu_urls[1] ELSE drink_menu_url END,
    drink_menu_updated_at = CASE WHEN p_drink_menu_urls IS NOT NULL THEN now() ELSE drink_menu_updated_at END,
    floor_plan_urls       = COALESCE(p_floor_plan_urls, floor_plan_urls),
    floor_plan_url        = CASE WHEN p_floor_plan_urls IS NOT NULL THEN p_floor_plan_urls[1] ELSE floor_plan_url END
  WHERE id = p_club_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT, TEXT, TEXT[], TEXT[]) TO authenticated;

COMMENT ON FUNCTION update_club_partner_fields(UUID, TEXT[], TEXT, TEXT, TEXT[], TEXT[]) IS
  '파트너 MD/admin이 tags / operating_hours / dresscode / drink_menu_urls / floor_plan_urls 화이트리스트로 수정.';

-- ── club-menus 스토리지: 파트너 MD가 자기 클럽 폴더에만 쓰기 (Admin 정책은 208에서 유지) ──
DROP POLICY IF EXISTS "Partner MD upload club menus" ON storage.objects;
CREATE POLICY "Partner MD upload club menus" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'club-menus'
    AND EXISTS (
      SELECT 1 FROM club_partners
      WHERE club_id::text = (storage.foldername(name))[1]
        AND md_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner MD update club menus" ON storage.objects;
CREATE POLICY "Partner MD update club menus" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'club-menus'
    AND EXISTS (
      SELECT 1 FROM club_partners
      WHERE club_id::text = (storage.foldername(name))[1]
        AND md_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partner MD delete club menus" ON storage.objects;
CREATE POLICY "Partner MD delete club menus" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'club-menus'
    AND EXISTS (
      SELECT 1 FROM club_partners
      WHERE club_id::text = (storage.foldername(name))[1]
        AND md_id = auth.uid()
    )
  );
