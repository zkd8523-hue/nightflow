-- 클럽 플로어맵 + 테이블 마커 시스템
ALTER TABLE clubs ADD COLUMN floor_plan_url TEXT;
ALTER TABLE clubs ADD COLUMN table_positions JSONB DEFAULT '[]';
-- table_positions 형식: [{"id":"uuid","x":30.5,"y":22.1,"label":"B1","type":"VIP"}, ...]
-- x, y는 이미지 대비 퍼센트 좌표 (0~100)
