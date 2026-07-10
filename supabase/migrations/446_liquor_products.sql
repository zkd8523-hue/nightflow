-- 깃발 오퍼 주류 배지 탭 시 보여줄 구조화된 주류 정보
-- 커버 범위: 클럽 가격표 사진에 실제 등장하는 주류부터 좁게 구축 (전체 브랜드 도감 아님)
-- 가격은 구간(min/max)만 저장, 화면에서 "20만원대~" 형태로 포맷 (정확한 평균가 노출 안 함)
CREATE TABLE IF NOT EXISTS liquor_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                 -- 정식 한글명, LIQUOR_BRANDS 표기와 일치 (예: "돔 페리뇽")
  category     TEXT NOT NULL,                  -- LIQUOR_CATEGORIES 키: hard/champagne/whisky/cognac/etc
  aliases      TEXT[] NOT NULL DEFAULT '{}',   -- BRAND_ALIASES 외 추가 매칭 문자열(클럽별 은어/오타 등)
  image_url    TEXT,
  description  TEXT,
  price_min    INTEGER,                        -- 원, 미상이면 NULL
  price_max    INTEGER,                        -- 원, NULL이면 "~이상" 오픈 구간
  is_active    BOOLEAN NOT NULL DEFAULT true,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('club_menu','external','manual')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquor_products_name ON liquor_products(name);
CREATE INDEX IF NOT EXISTS idx_liquor_products_category ON liquor_products(category) WHERE is_active;

ALTER TABLE liquor_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active liquor products" ON liquor_products;
CREATE POLICY "Public read active liquor products" ON liquor_products
  FOR SELECT USING (is_active);

DROP POLICY IF EXISTS "Admin manages liquor products" ON liquor_products;
CREATE POLICY "Admin manages liquor products" ON liquor_products
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP TRIGGER IF EXISTS trg_liquor_products_updated_at ON liquor_products;
CREATE TRIGGER trg_liquor_products_updated_at
  BEFORE UPDATE ON liquor_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 주류 상품 이미지 스토리지 버킷 (club-menus와 동일 패턴, Migration 208 참조)
INSERT INTO storage.buckets (id, name, public)
VALUES ('liquor-products', 'liquor-products', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read liquor product images" ON storage.objects;
CREATE POLICY "Public read liquor product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'liquor-products');

DROP POLICY IF EXISTS "Admin upload liquor product images" ON storage.objects;
CREATE POLICY "Admin upload liquor product images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'liquor-products'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin update liquor product images" ON storage.objects;
CREATE POLICY "Admin update liquor product images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'liquor-products'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin delete liquor product images" ON storage.objects;
CREATE POLICY "Admin delete liquor product images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'liquor-products'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
