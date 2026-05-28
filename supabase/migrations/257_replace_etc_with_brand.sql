-- Migration 257: 매치 깃발의 "기타 5병" → "모엣 5병", "기타 1병" → "데킬라 1병"
-- 배열 안의 특정 문자열만 교체. 다른 항목은 보존.

UPDATE puzzle_offers
SET includes = array_replace(
  array_replace(includes, '기타 5병', '모엣 5병'),
  '기타 1병',
  '데킬라 1병'
)
WHERE id = (
  SELECT accepted_offer_id
  FROM puzzles
  WHERE id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'
);
