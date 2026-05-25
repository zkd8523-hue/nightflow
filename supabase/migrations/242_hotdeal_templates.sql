-- 242: 핫딜 템플릿 테이블
-- 조각(auction_templates) 패턴 그대로 — 자주 쓰는 핫딜 세팅을 저장해 원클릭 재사용
-- 핫딜은 종료시각이 매번 다르므로 종료시각은 템플릿에 저장하지 않음

CREATE TABLE hotdeal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  description TEXT,
  price INTEGER,
  original_price INTEGER,
  walk_minutes INTEGER,
  nearest_station TEXT,
  table_info TEXT,
  table_features TEXT[] DEFAULT '{}',
  liquor_includes TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotdeal_templates_md ON hotdeal_templates(md_id);
ALTER TABLE hotdeal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own hotdeal templates" ON hotdeal_templates
  FOR ALL USING (auth.uid() = md_id);

-- 최대 5개 제한 트리거 (조각 템플릿과 동일)
CREATE OR REPLACE FUNCTION check_hotdeal_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM hotdeal_templates WHERE md_id = NEW.md_id) >= 5 THEN
    RAISE EXCEPTION '핫딜 템플릿은 최대 5개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_hotdeal_template_limit
  BEFORE INSERT ON hotdeal_templates
  FOR EACH ROW EXECUTE FUNCTION check_hotdeal_template_limit();

CREATE TRIGGER hotdeal_templates_updated_at
  BEFORE UPDATE ON hotdeal_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
