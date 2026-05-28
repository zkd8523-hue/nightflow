-- Migration 258: "모엣 5병" → "모엣 샹동 5병" (브랜드 정식 표기)
-- LIQUOR_BRANDS에 등록된 정식 명칭은 "모엣 샹동". 클라이언트가 카테고리로 매핑하려면 이 이름이어야 함.

UPDATE puzzle_offers
SET includes = array_replace(includes, '모엣 5병', '모엣 샹동 5병')
WHERE id = (
  SELECT accepted_offer_id
  FROM puzzles
  WHERE id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'
);
