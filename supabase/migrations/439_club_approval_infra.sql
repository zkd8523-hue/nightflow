-- ============================================================================
-- Migration 439: 클럽 전면 신청제 인프라 (1단계 = DB)
-- 날짜: 2026-07-09
-- 배경: 클럽 생성 유일 경로인 MD 등록폼(ClubForm)이 사전 중복검사 없이 clubs를
--       바로 만들어 중복이 재발. 재발 방지 = "MD 클럽 추가 신청 → 관리자 승인" 전면 신청제.
--       승인 뼈대(clubs.status pending/approved/rejected, approved_by/at, rejected_reason)는
--       Migration 046에 이미 있음(121에서 default를 approved로 바꿔 사실상 비활성).
-- 이 마이그레이션(1단계, 안전/추가형 — default는 아직 안 바꿈):
--   1) find_similar_clubs(): 승인 화면에서 "닮은 기존 클럽" 후보 조회
--      (정규화 이름 일치 OR 좌표 반경 ~200m). '클럽/club' 접두·접미 제거 정규화 포함.
--   2) approve_club() / reject_club(): 관리자 승인/반려 액션 (admin 가드).
--   ※ default를 pending으로 바꾸는 전환과 유저화면 숨김은 관리자 승인화면 완성 후 별도 단계.
-- 적용: 대시보드 SQL Editor 1회 실행. db push 금지.
-- ============================================================================

-- ── 정규화 헬퍼: lower+trim+연속공백1개+'클럽/club' 접두·접미 제거 ──
CREATE OR REPLACE FUNCTION _norm_club_name(p TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
           regexp_replace(lower(trim(regexp_replace(coalesce(p,''), '\s+', ' ', 'g'))),
                          '^(클럽|club)\s+', '', 'i'),
           '\s+(클럽|club)$', '', 'i')
$$ LANGUAGE sql IMMUTABLE;

-- ── 닮은 클럽 후보 (승인 화면용) ──
-- 반환: 정규화 이름이 같거나 좌표가 ~200m 이내인 '활성' 클럽 + 파트너수 + 대략거리(m)
CREATE OR REPLACE FUNCTION find_similar_clubs(
  p_name TEXT,
  p_lat  DOUBLE PRECISION DEFAULT NULL,
  p_lng  DOUBLE PRECISION DEFAULT NULL,
  p_exclude UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, name TEXT, area TEXT, status TEXT, thumbnail_url TEXT,
  partner_count BIGINT, distance_m INTEGER, reason TEXT
) AS $$
  WITH base AS (
    SELECT c.id, c.name, c.area, c.status, c.thumbnail_url, c.latitude, c.longitude,
           (_norm_club_name(c.name) = _norm_club_name(p_name)) AS name_match,
           CASE WHEN p_lat IS NOT NULL AND c.latitude IS NOT NULL THEN
             ROUND(6371000 * acos(LEAST(1, GREATEST(-1,
               sin(radians(p_lat))*sin(radians(c.latitude)) +
               cos(radians(p_lat))*cos(radians(c.latitude))*cos(radians(c.longitude - p_lng))
             ))))::INT
           END AS dist_m
    FROM clubs c
    WHERE c.deleted_at IS NULL AND c.is_test = false
      AND (p_exclude IS NULL OR c.id <> p_exclude)
  )
  SELECT b.id, b.name, b.area, b.status, b.thumbnail_url,
         (SELECT COUNT(*) FROM club_partners cp WHERE cp.club_id = b.id) AS partner_count,
         b.dist_m,
         CASE WHEN b.name_match AND b.dist_m IS NOT NULL AND b.dist_m <= 200 THEN '이름+위치 일치'
              WHEN b.name_match THEN '이름 일치'
              ELSE '위치 근접(200m 이내)' END AS reason
  FROM base b
  WHERE b.name_match OR (b.dist_m IS NOT NULL AND b.dist_m <= 200)
  ORDER BY b.name_match DESC, b.dist_m NULLS LAST
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 승인 ──
CREATE OR REPLACE FUNCTION approve_club(p_club_id UUID)
RETURNS JSON AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE clubs SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = COALESCE(approved_at, now()),
    first_approved_at = COALESCE(first_approved_at, now()),
    last_approved_at = now()
  WHERE id = p_club_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found or deleted'; END IF;
  RETURN json_build_object('success', true, 'status', 'approved');
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 반려 ──
CREATE OR REPLACE FUNCTION reject_club(p_club_id UUID, p_reason TEXT)
RETURNS JSON AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION '반려 사유는 필수입니다'; END IF;
  UPDATE clubs SET status = 'rejected', rejected_reason = p_reason
  WHERE id = p_club_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found or deleted'; END IF;
  RETURN json_build_object('success', true, 'status', 'rejected');
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 검증:
--   SELECT * FROM find_similar_clubs('브리드', 35.866, 128.598);  -- 대구 브리드 근처 후보
--   SELECT * FROM find_similar_clubs('에이스', NULL, NULL);        -- 이름만으로 '클럽 에이스' 잡히는지
-- 다음 단계(2): 관리자 /admin/clubs/pending 승인 화면. (3): default→pending + 유저화면 status 필터.
-- ============================================================================
