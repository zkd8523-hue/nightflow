-- clubs 테이블에 플로어맵 관련 컬럼 추가
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS table_positions JSONB DEFAULT '[]';
-- table_positions 형식: [{"id":"uuid","x":30.5,"y":22.1,"label":"B1","type":"VIP"}, ...]
-- x, y는 이미지 대비 퍼센트 좌표 (0~100)
