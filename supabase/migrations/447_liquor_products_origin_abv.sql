-- 주류 정보 카드 확장: 원산지/도수 뱃지 + 역사·평판 한 줄(있는 경우만)
ALTER TABLE liquor_products
  ADD COLUMN IF NOT EXISTS origin TEXT,        -- 원산지 국가 (예: "프랑스", "스코틀랜드")
  ADD COLUMN IF NOT EXISTS abv NUMERIC(4,1),   -- 도수 (%), 예: 40.0
  ADD COLUMN IF NOT EXISTS accolade TEXT;      -- 역사/평판 한 줄 — 근거 있는 경우에만, 없으면 NULL
