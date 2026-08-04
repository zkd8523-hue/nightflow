-- ============================================================================
-- Migration 515: 조각 템플릿 수동 정렬 순서
-- 날짜: 2026-08-05
-- 배경:
--   상시 조각 목록은 등록순(created_at)으로만 보였다. MD가 자주 켜는 자리를 위로
--   올리는 등 순서를 직접 잡을 수 있어야 한다(share_options는 302에서 이미 sort_order 보유).
--
--   기본값은 등록순 그대로 — 기존 행에 created_at 순번을 채워 넣어 화면 순서가 변하지 않게 한다.
-- ============================================================================

ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 기존 행 백필: MD별 created_at 오름차순으로 0,1,2…
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY md_id ORDER BY created_at) - 1 AS rn
  FROM auction_templates
)
UPDATE auction_templates t
SET sort_order = o.rn
FROM ordered o
WHERE t.id = o.id;

CREATE INDEX IF NOT EXISTS idx_auction_templates_md_sort
  ON auction_templates(md_id, sort_order);

COMMENT ON COLUMN auction_templates.sort_order IS
  'MD 목록 내 표시 순서(오름차순). 기본은 등록순 백필, 드래그로 변경.';
