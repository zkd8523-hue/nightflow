-- ============================================================================
-- Migration 178: club_partners 기반 RLS/RPC/트리거 전환 (Phase 3)
-- 날짜: 2026-05-16
-- 설명:
--   Phase 1(Migration 174)에서 도입한 club_partners 조인 테이블을 활용해
--   RLS·트리거·RPC를 N:N 구조로 전환한다.
--
--   양립 원칙:
--     - clubs.md_id 컬럼은 그대로 유지 (Phase 4에서 별도 제거 예정)
--     - 기존 md_id 기반 RLS 정책도 그대로 두고, club_partners 기반 정책을 추가
--     - 어느 한쪽이 잠시 비어 있어도 권한이 깨지지 않게 OR 조건
--
--   이전 정의 위치:
--     - check_club_limit():  Migration 121 → 144
--     - set_default_club():  Migration 012
--     - merge_clubs():       Migration 145
-- ============================================================================

-- 1) check_club_limit: clubs.md_id COUNT → club_partners 기준
--    BEFORE INSERT 시점에는 club_partners에 새 row가 없으므로
--    "현재 partner로 들어 있는 active 클럽 수 >= 3" 검사가
--    기존 4번째 INSERT 차단과 동일하게 동작한다.
CREATE OR REPLACE FUNCTION check_club_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.md_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF (
    SELECT COUNT(DISTINCT cp.club_id)
    FROM club_partners cp
    JOIN clubs c ON c.id = cp.club_id
    WHERE cp.md_id = NEW.md_id
      AND c.deleted_at IS NULL
  ) >= 3 THEN
    RAISE EXCEPTION '클럽은 최대 3개까지 등록할 수 있습니다';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) set_default_club: clubs.md_id 검증 → club_partners 기반
CREATE OR REPLACE FUNCTION set_default_club(p_club_id UUID)
RETURNS json AS $$
DECLARE
  v_user_id UUID;
  v_is_md_club BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  -- 빈 값 허용 (기본 클럽 해제)
  IF p_club_id IS NULL THEN
    UPDATE users SET default_club_id = NULL WHERE id = v_user_id;
    RETURN json_build_object('success', true, 'message', '기본 클럽이 해제되었습니다');
  END IF;

  -- MD가 club_partners를 통해 해당 클럽에 소속되어 있는지 확인
  SELECT EXISTS(
    SELECT 1
    FROM club_partners cp
    JOIN clubs c ON c.id = cp.club_id
    WHERE cp.club_id = p_club_id
      AND cp.md_id = v_user_id
      AND c.deleted_at IS NULL
  ) INTO v_is_md_club;

  IF NOT v_is_md_club THEN
    RETURN json_build_object('success', false, 'message', '본인이 소속된 클럽만 기본 클럽으로 설정할 수 있습니다');
  END IF;

  UPDATE users SET default_club_id = p_club_id WHERE id = v_user_id;

  RETURN json_build_object('success', true, 'message', '기본 클럽이 설정되었습니다');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) merge_clubs: club_partners 이관 추가 + 추가 자식 테이블 처리
--    Gemini 지적 #2: INSERT ON CONFLICT + DELETE 분리 패턴으로 UNIQUE 충돌 안전 처리
CREATE OR REPLACE FUNCTION merge_clubs(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_admin_role TEXT;
  v_target_active BOOLEAN;
  v_source_active BOOLEAN;
  v_auction_count INT := 0;
  v_md_count INT := 0;
  v_partner_count INT := 0;
BEGIN
  -- Admin 권한 확인
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge club into itself';
  END IF;

  SELECT (deleted_at IS NULL) INTO v_target_active FROM clubs WHERE id = p_target_id;
  SELECT (deleted_at IS NULL) INTO v_source_active FROM clubs WHERE id = p_source_id;
  IF v_target_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Target club not found or already deleted';
  END IF;
  IF v_source_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Source club not found or already deleted';
  END IF;

  -- 1. auctions 이전
  UPDATE auctions SET club_id = p_target_id WHERE club_id = p_source_id;
  GET DIAGNOSTICS v_auction_count = ROW_COUNT;

  -- 2. default_club_id 이전
  UPDATE users SET default_club_id = p_target_id WHERE default_club_id = p_source_id;
  GET DIAGNOSTICS v_md_count = ROW_COUNT;

  -- 3. club_partners 이관 (INSERT ON CONFLICT + DELETE 패턴)
  INSERT INTO club_partners (club_id, md_id, role, joined_at)
  SELECT p_target_id, cp.md_id, cp.role, cp.joined_at
  FROM club_partners cp
  WHERE cp.club_id = p_source_id
  ON CONFLICT (club_id, md_id) DO NOTHING;

  DELETE FROM club_partners WHERE club_id = p_source_id;
  GET DIAGNOSTICS v_partner_count = ROW_COUNT;

  -- 4. source 클럽 soft-delete
  UPDATE clubs
  SET deleted_at = now(), deleted_by = auth.uid()
  WHERE id = p_source_id;

  RETURN json_build_object(
    'success', true,
    'merged_auctions', v_auction_count,
    'merged_mds', v_md_count,
    'merged_partners', v_partner_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) clubs RLS: club_partners 기반 UPDATE 정책 추가 (기존 md_id 정책과 양립)
--    기존 "MD can update own pending clubs" (Migration 048) 정책은 유지.
--    여기서는 club_partners를 통해 소속된 MD도 같은 권한을 갖도록 별도 정책 추가.
DROP POLICY IF EXISTS "MD via club_partners can update clubs" ON clubs;
CREATE POLICY "MD via club_partners can update clubs"
  ON clubs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_partners cp
      WHERE cp.club_id = clubs.id
        AND cp.md_id = auth.uid()
    )
    AND status IN ('pending', 'rejected')
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('md', 'admin'))
  );

-- 5) 검증 쿼리 (수동 실행용 주석)
-- (a) club_partners 미동기화 active 클럽
--   SELECT c.id FROM clubs c
--   WHERE c.md_id IS NOT NULL AND c.deleted_at IS NULL
--     AND NOT EXISTS (SELECT 1 FROM club_partners cp WHERE cp.club_id = c.id AND cp.md_id = c.md_id);
--
-- (b) active MD인데 club_partners 0 (있으면 안 됨)
--   SELECT u.id, u.name FROM users u
--   WHERE u.md_status='approved' AND u.deleted_at IS NULL
--     AND EXISTS (SELECT 1 FROM clubs c WHERE c.md_id = u.id AND c.deleted_at IS NULL)
--     AND NOT EXISTS (SELECT 1 FROM club_partners cp WHERE cp.md_id = u.id);
