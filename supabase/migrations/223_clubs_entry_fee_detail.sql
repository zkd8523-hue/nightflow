-- 223: clubs.entry_fee_detail
-- 입장료 상세 텍스트 (예: "남 15,000 / 여 10,000")
-- entry:free/low/mid/high 태그는 그대로 두고, 구체 금액·성별 차등은 여기에.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS entry_fee_detail TEXT;
