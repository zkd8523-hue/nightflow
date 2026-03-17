-- 065: 경매 템플릿 테이블 재설계
-- 기존 004/005 마이그레이션의 스키마를 AuctionForm 실제 필드에 맞게 재구성
-- 변경: table_type/min_people/max_people/original_price 제거, table_info/buy_now_price/last_used_at 추가

-- 기존 테이블 삭제 (프리런칭이므로 데이터 손실 없음)
DROP TABLE IF EXISTS auction_templates CASCADE;

CREATE TABLE auction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  table_info TEXT,
  start_price INTEGER,
  buy_now_price INTEGER,
  includes TEXT[] DEFAULT '{}',
  duration_minutes INTEGER DEFAULT 15,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_md ON auction_templates(md_id);
ALTER TABLE auction_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own templates" ON auction_templates
  FOR ALL USING (auth.uid() = md_id);

-- 최대 5개 제한 트리거
CREATE OR REPLACE FUNCTION check_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM auction_templates WHERE md_id = NEW.md_id) >= 5 THEN
    RAISE EXCEPTION '템플릿은 최대 5개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_template_limit
  BEFORE INSERT ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION check_template_limit();

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER auction_templates_updated_at
  BEFORE UPDATE ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
