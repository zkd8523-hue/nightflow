-- ============================================================================
-- Migration 649: 주대가 등록된 클럽 id만 뽑는 RPC
--
-- 배경(2026-09-06 실측 버그): 외국인 목록·상세에서 "즉시 예약 가능" 배지를 달려면
--      주대(club_menu_items)가 있는 클럽 집합이 필요하다. 그런데 이걸
--      `select("club_id")`로 통째로 읽으면 PostgREST 기본 상한(1000행)에 걸린다.
--      지금 항목이 1,155행이라 이미 초과 상태였고, 잘린 뒤쪽 클럽이 조용히
--      "주대 없음"으로 판정돼 부산 3곳(그루브&스팟·Azit·BELPOS)의 배지가
--      통째로 사라져 있었다. 에러가 아니라 조용한 오판이라 더 위험하다.
--
--      클럽은 32곳인데 행은 1,155개 — 필요한 건 "서로 다른 club_id"뿐이므로
--      DB에서 DISTINCT로 줄여 받는다. 32행이면 상한과 무관해진다.
--
-- SECURITY DEFINER를 쓰지 않는다: club_menu_items는 이미 공개 읽기라
-- 권한을 올릴 이유가 없다. 노출되는 것도 "이 클럽에 메뉴가 있다"는 사실뿐이다.
-- ============================================================================

CREATE OR REPLACE FUNCTION club_ids_with_menu()
RETURNS TABLE (club_id UUID)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT i.club_id FROM club_menu_items i;
$$;

GRANT EXECUTE ON FUNCTION club_ids_with_menu() TO anon, authenticated;

COMMENT ON FUNCTION club_ids_with_menu() IS
  '주대가 등록된 클럽 id 목록. 목록 화면의 "예약 가능" 배지 판정용 — 행 상한 회피.';
