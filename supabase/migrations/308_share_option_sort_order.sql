-- share_options 드래그앤드롭 순서 저장
ALTER TABLE share_options ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 기존 옵션에 created_at 순으로 순번 부여
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY md_id, club_id ORDER BY created_at) - 1 AS rn
  FROM share_options
)
UPDATE share_options SET sort_order = ranked.rn
FROM ranked WHERE share_options.id = ranked.id;
