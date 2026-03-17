-- 경매 템플릿 테이블 생성
CREATE TABLE auction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
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

-- 인덱스
CREATE INDEX idx_templates_md ON auction_templates(md_id);

-- RLS 활성화
ALTER TABLE auction_templates ENABLE ROW LEVEL SECURITY;

-- RLS 정책: MD는 본인 템플릿만 관리 가능
CREATE POLICY "MD can manage own templates" ON auction_templates
  FOR ALL USING (auth.uid() = md_id);

-- 최대 10개 제한 트리거 함수
CREATE OR REPLACE FUNCTION check_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM auction_templates WHERE md_id = NEW.md_id) >= 10 THEN
    RAISE EXCEPTION '템플릿은 최대 10개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 최대 10개 제한 트리거
CREATE TRIGGER enforce_template_limit
  BEFORE INSERT ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION check_template_limit();

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
