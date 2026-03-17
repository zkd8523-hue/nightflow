-- ================================
-- 1. AUCTION_TEMPLATES (경매 템플릿)
-- ================================
CREATE TABLE auction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- 템플릿 이름 (예: "메인 VIP 1바틀")
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  table_type TEXT CHECK (table_type IN ('Standard', 'VIP', 'Premium')),
  min_people INTEGER,
  max_people INTEGER,
  original_price INTEGER,
  start_price INTEGER,
  includes TEXT[] DEFAULT '{}',
  duration_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 2. 인덱스
-- ================================
CREATE INDEX idx_templates_md ON auction_templates(md_id);

-- ================================
-- 3. RLS (Row Level Security)
-- ================================
ALTER TABLE auction_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own templates" ON auction_templates
  FOR ALL USING (auth.uid() = md_id);

-- ================================
-- 4. 최대 10개 제한 트리거
-- ================================
CREATE OR REPLACE FUNCTION check_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM auction_templates WHERE md_id = NEW.md_id) >= 10 THEN
    RAISE EXCEPTION '템플릿은 최대 10개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_template_limit
  BEFORE INSERT ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION check_template_limit();

-- ================================
-- 5. updated_at 갱신 트리거
-- ================================
CREATE TRIGGER auction_templates_updated_at
  BEFORE UPDATE ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
