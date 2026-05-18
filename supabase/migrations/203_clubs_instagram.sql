-- ============================================================================
-- Migration 203: clubs.instagram — 클럽 공식 인스타그램 핸들
-- 날짜: 2026-05-19
-- 설명:
--   클럽 상세 페이지에서 공식 인스타그램으로 바로 이동할 수 있도록 컬럼 추가.
--   값은 핸들만 저장 (예: 'clubaceseoul_official'), 프론트에서 'https://instagram.com/'
--   prefix 처리. URL 통째로 받지 않는 이유: 변경/리브랜딩 시 핸들만 갱신하면 됨.
-- ============================================================================

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS instagram TEXT;

-- 초기 시드 (관리자가 수집한 공식 핸들)
UPDATE clubs SET instagram = 'clubaceseoul_official'
  WHERE id IN (
    '35de296e-5fdc-435b-baf2-1c7c05538687',  -- Club Ace
    '4c8b8c51-b03f-4d50-98bf-e3c9b7ecfedf'   -- 클럽 에이스 (중복 추정 → 동일 핸들)
  );

UPDATE clubs SET instagram = 'dmseoul'
  WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7';  -- DM 라운지

UPDATE clubs SET instagram = 'arzu_lounge'
  WHERE id = 'c6e747de-140f-4a76-857d-6ed51d09b217';  -- 아르쥬 청담 라운지

UPDATE clubs SET instagram = 'color_apgu'
  WHERE id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60';  -- 컬러 압구

UPDATE clubs SET instagram = 'hype_seoul'
  WHERE id = '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae';  -- HYPE SEOUL

UPDATE clubs SET instagram = 'plus82seoul'
  WHERE id = '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4';  -- 플팔 (Plus 82)

UPDATE clubs SET instagram = 'bermuda_hongdae'
  WHERE id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd';  -- CLUB BERMUDA

UPDATE clubs SET instagram = 'club_dokkaebi_official'
  WHERE id = '93f1081a-250c-402a-a0d4-9b8a309aff57';  -- 도깨비

UPDATE clubs SET instagram = 'club_ocean_official'
  WHERE id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542';  -- OCEAN

UPDATE clubs SET instagram = 'daynight_itaewon'
  WHERE id = '103400ee-b647-428f-ae76-07131a720dc6';  -- Day&night

UPDATE clubs SET instagram = 'clubtheseoul'
  WHERE id = 'e1f186f4-504b-4acd-bc06-9e2cff29e1dd';  -- The seoul

UPDATE clubs SET instagram = 'veil_social_club'
  WHERE id = 'bb929c21-bd6d-4766-85c6-2b51452058da';  -- VEIL CLUB (광주)

UPDATE clubs SET instagram = 'breed_official'
  WHERE id = '5cf5658b-b1ba-4744-a1d0-ae4a60a67828';  -- 브리드(BREED) (대구)

UPDATE clubs SET instagram = 'groovenspot'
  WHERE id = '0d24b754-6c1d-40f6-badd-b398d03a4b3f';  -- 그루브&스팟 (부산)
