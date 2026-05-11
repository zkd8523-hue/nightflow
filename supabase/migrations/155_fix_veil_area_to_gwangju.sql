-- Veil Club은 강남이 아니라 광주 소재이므로 area / name 보정
UPDATE clubs
SET
  area = '광주',
  name = REGEXP_REPLACE(name, '^강남\s*', '광주 ')
WHERE id = 'bb929c21-bd6d-4766-85c6-2b51452058da';
