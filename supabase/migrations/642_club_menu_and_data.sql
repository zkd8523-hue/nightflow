-- ============================================================================
-- Migration 642: 클럽 주대(술값) 메뉴 구조화 + 5개 클럽 데이터
--
-- 원래 642~649 8개 파일로 나눠 썼던 것을 한 번에 적용할 수 있게 하나로 합쳤다.
-- 대시보드에 이 파일 하나만 통째로 붙여넣으면 된다.
--
-- ── 배경 ────────────────────────────────────────────────────────────────
-- 지금 술값 정보는 clubs.drink_menu_urls의 "이미지"뿐이다(298). 이미지라 어느
-- 좌표에 어떤 품목·가격이 있는지 시스템이 모르고, 그래서 외국인 예약이
-- "손님 예산 → 운영자가 MD에 문의 → 손님에 메뉴 문의 → MD에 전달" 4왕복이 된다.
-- 메뉴판 사진을 읽어 구조화해두면 손님이 직접 고르고 가격이 확정된 채로 요청이
-- 들어와 왕복이 1번으로 줄어든다.
--
-- ── 구성 ────────────────────────────────────────────────────────────────
--   1부. 스키마      club_menu_items / _variants / _choices / _combos
--                    + clubs.table_charge_*  + foreign_requests.selected_menu
--   2부. 메뉴 데이터  CLUB BERMUDA / DM SEOUL / OCEAN / Club Ace / 그루브&스팟
--                    (파트너 MD가 많은 순 상위 5곳, 메뉴판 이미지 24장을 읽어 입력)
--
-- 결과: 항목 239개 / 가격옵션 403개 / 조합표 65행 / 선택형 후보 30개
--
-- ── 실물 메뉴판에서 확인한 구조 (8개 클럽 24장) ──────────────────────────
--   ① 단품          Jägermeister 250,000                → item 1 + variant 1
--   ② 병수 세트     Carbonic 3B 70만 / 5B 120만 / 10B   → item 1 + variant N
--                   230만 (전체의 절반 이상)
--   ③ 선택형 세트   "하드 1 + 샴페인 1, 하드는 7종 중    → item 1 + choices N
--                   택1" (OCEAN·Core·Color·DM·BERMUDA)
--   ④ 조합표        "샴페인 N + 하드 M" 65조합           → club_menu_combos
--                   (Club Ace 전용)
--
-- 카테고리 9개: champagne / liqueur / whisky / tequila / vodka / cognac /
--               gin / rum / set
-- 이와 직교하는 축 2개: is_vvip(등급), zone(층별 가격표)
--
-- ⚠️ 적용은 이 파일 하나로 끝나지만, 코드 배포보다 반드시 먼저 적용해야 한다.
--    안 그러면 없는 테이블을 select해서 /en 폼이 500난다.
-- ============================================================================


-- ############################################################################
-- 1부. 스키마
-- ############################################################################

-- ---------------------------------------------------------------------------
-- 1) 테이블 차지 (부대비용)
--
-- 8곳 중 5곳에 있고 금액이 클럽마다 다르며 요일에 따라서도 다르다:
--   HYPE 5만 / Core 5만 / Color 5만 / OCEAN 주말 10만 / BERMUDA 평일3만·주말5만
-- 전부 메뉴판 "맨 아래 한 줄"이라 손님이 놓치기 쉽다. 이걸 담아두지 않으면
-- 손님이 본 총액과 현장 청구액이 어긋나고, 외국인 상대로는 그게 곧 클레임이다.
-- 모든 클럽에 해당하는 성격이라 별도 테이블 대신 clubs 컬럼으로 둔다.
-- ---------------------------------------------------------------------------
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS table_charge_weekday INTEGER,
  ADD COLUMN IF NOT EXISTS table_charge_weekend INTEGER;

COMMENT ON COLUMN clubs.table_charge_weekday IS
  '평일 테이블 차지(원). NULL = 미확인, 0 = 확인했고 안 받음. 메뉴판 하단 문구 기준.';
COMMENT ON COLUMN clubs.table_charge_weekend IS
  '주말 테이블 차지(원). 평일/주말 구분이 없는 클럽은 두 컬럼에 같은 값.';

-- ---------------------------------------------------------------------------
-- 2) 메뉴 항목 (카테고리 탭 + 리스트)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'champagne', 'liqueur', 'whisky', 'tequila', 'vodka', 'set'
  )),
  -- 외국인 대상이라 영문이 주. 메뉴판에 영문이 없으면 한글을 로마자로 옮겨 채운다.
  name_en TEXT NOT NULL,
  name_ko TEXT,
  description TEXT,
  image_url TEXT,
  -- 금액이 아닌 "주문 자격 조건". Color Apgu의 "00:30 이전에 입장한 VIP 테이블
  -- 고객에 한하여 주문 가능" 같은 것. 시스템이 판정하지 않고 화면에 문구로만
  -- 노출한다 — 판정하려면 입장시간·좌석등급을 알아야 하는데 그건 MD가 정한다.
  condition_note TEXT,
  -- 층/존별로 가격표가 갈리는 클럽용(그루브&스팟 "3F : EDM ZONE"). 8곳 중 1곳
  -- 뿐이라 컬럼만 만들어두고 당장은 NULL로 둔다. NULL = 클럽 전체 공통.
  zone TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_menu_items_club
  ON club_menu_items (club_id, category, sort_order)
  WHERE is_active;

COMMENT ON TABLE club_menu_items IS
  '클럽 주대 메뉴 항목. 메뉴판 이미지(clubs.drink_menu_urls)를 읽어 구조화한 것.';

-- ---------------------------------------------------------------------------
-- 3) 항목별 가격 옵션
--
-- 단품이면 1행("1 bottle"), 병수 세트면 여러 행(3/5/10/11 bottle).
-- 가격을 별도 테이블로 빼는 이유: 메뉴판 절반 이상이 같은 품목에 병 수별로 다른
-- 가격을 매기는 구조라, 항목에 price 컬럼 하나만 두면 표현이 안 된다.
-- (BERMUDA는 단품가 + 3/5/10병가로 한 품목에 variant가 4개 붙는다)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_menu_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES club_menu_items(id) ON DELETE CASCADE,
  label_en TEXT NOT NULL,          -- "1 bottle" / "3 bottle set"
  label_ko TEXT,
  price INTEGER NOT NULL CHECK (price > 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_club_menu_variants_item
  ON club_menu_variants (item_id, sort_order);

COMMENT ON TABLE club_menu_variants IS
  '메뉴 항목의 가격 옵션. 단품=1행, 병수 세트=N행.';

-- ---------------------------------------------------------------------------
-- 4) 선택형 세트의 후보 품목
--
-- OCEAN "HARD BOTTLE SET 1 = 하드 1 + 샴페인 1"에서 하드는 7종 중 택1이고
-- 일부는 +50,000 업차지가 붙는다. Core "앱솔루트 ⇒ 말리부 or 제임슨 변경가능",
-- Color "티나/무아/씨에라 택1"도 같은 패턴.
--
-- 이걸 담지 않고 세트를 단품처럼 넣으면 손님이 뭘 고를지 못 정하고 결국 운영자가
-- 다시 물어봐야 한다 — 왕복을 줄이려는 이 작업의 목적 자체가 깨진다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_menu_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES club_menu_items(id) ON DELETE CASCADE,
  -- 한 세트 안에 "택1"이 두 번 나오면 1, 2로 구분한다.
  -- (Color 3 BOTTLE SET = 오트쿠티르 1 + 티나/무아/씨에라 "택 2")
  slot_no INT NOT NULL DEFAULT 1 CHECK (slot_no > 0),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  image_url TEXT,
  -- OCEAN SET 2의 "+50,000w" 같은 업차지. 0이면 추가금 없음.
  extra_price INTEGER NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_club_menu_choices_item
  ON club_menu_choices (item_id, slot_no, sort_order);

COMMENT ON TABLE club_menu_choices IS
  '선택형 세트에서 손님이 고를 수 있는 후보 품목. slot_no로 택1 슬롯을 구분.';

-- ---------------------------------------------------------------------------
-- 5) 조합표
--
-- "샴페인 N개 + 하드 M개 = 얼마" 형태. 품목이 아니라 수량 조합이라 위 구조에
-- 넣으면 조회가 지저분해져 분리한다. 현재는 Club Ace 한 곳(약 60행)에만 있다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_menu_combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  cham_count INT NOT NULL CHECK (cham_count >= 0),
  hard_count INT NOT NULL CHECK (hard_count >= 0),
  price INTEGER NOT NULL CHECK (price > 0),
  UNIQUE (club_id, cham_count, hard_count)
);

CREATE INDEX IF NOT EXISTS idx_club_menu_combos_club
  ON club_menu_combos (club_id, cham_count, hard_count);

COMMENT ON TABLE club_menu_combos IS
  '샴페인 N + 하드 M 조합별 가격표. Club Ace 형태의 메뉴판용.';

-- ---------------------------------------------------------------------------
-- RLS
--
-- 손님이 로그인 없이 /en에서 메뉴를 봐야 하므로 SELECT는 전원 공개.
-- 쓰기는 admin만 — 가격 변조는 곧 정산 분쟁이라 파트너 MD에게도 열지 않는다.
-- (MD가 직접 수정할 필요가 생기면 update_club_partner_fields 같은 화이트리스트
--  RPC로 따로 여는 게 맞다)
-- ---------------------------------------------------------------------------
ALTER TABLE club_menu_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_menu_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_menu_choices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_menu_combos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads club menu items" ON club_menu_items;
CREATE POLICY "public reads club menu items" ON club_menu_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manages club menu items" ON club_menu_items;
CREATE POLICY "admin manages club menu items" ON club_menu_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "public reads club menu variants" ON club_menu_variants;
CREATE POLICY "public reads club menu variants" ON club_menu_variants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manages club menu variants" ON club_menu_variants;
CREATE POLICY "admin manages club menu variants" ON club_menu_variants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "public reads club menu choices" ON club_menu_choices;
CREATE POLICY "public reads club menu choices" ON club_menu_choices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manages club menu choices" ON club_menu_choices;
CREATE POLICY "admin manages club menu choices" ON club_menu_choices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "public reads club menu combos" ON club_menu_combos;
CREATE POLICY "public reads club menu combos" ON club_menu_combos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manages club menu combos" ON club_menu_combos;
CREATE POLICY "admin manages club menu combos" ON club_menu_combos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS club_menu_items_updated_at ON club_menu_items;
CREATE TRIGGER club_menu_items_updated_at
  BEFORE UPDATE ON club_menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 손님이 고른 메뉴를 요청에 저장 ───────────────────────────────────────

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS selected_menu JSONB,
  ADD COLUMN IF NOT EXISTS selected_menu_total INTEGER;

-- FK가 아니라 이름·가격까지 통째로 박는 스냅샷 구조다. 클럽이 나중에 가격을
-- 바꿔도 "손님이 신청 당시 본 가격"이 그대로 남아야 분쟁이 안 생긴다.
-- 테이블 차지도 여기 함께 박아둔다 — 메뉴판 하단 한 줄이라 손님이 놓치기 쉽고,
-- 총액에 안 들어가면 현장 청구액과 어긋난다.
--
-- {
--   "items": [
--     { "item_id": "...", "variant_id": "...",
--       "name_en": "Carbonic Blue", "label_en": "3 bottle set",
--       "price": 700000, "qty": 1,
--       "choices": [ { "slot_no": 1, "name_en": "Jägermeister", "extra_price": 0 } ] }
--   ],
--   "combo": { "cham_count": 2, "hard_count": 1, "price": 850000 },
--   "table_charge": { "amount": 50000, "basis": "weekend" }
-- }
COMMENT ON COLUMN foreign_requests.selected_menu IS
  '손님이 고른 메뉴 스냅샷(이름·가격 포함). 가격 변동에도 신청 시점 가격을 보존.';

-- 합계. 목록/정렬에서 JSONB를 파싱하지 않으려고 별도 컬럼으로 둔다.
-- 테이블 차지를 포함한 최종 금액이다.
COMMENT ON COLUMN foreign_requests.selected_menu_total IS
  '고른 메뉴 + 테이블 차지 합계(원). 메뉴를 고르지 않은 요청은 NULL(기존 예산 흐름).';

-- ─── 실물 메뉴판 추가 확인 결과 반영 (원래 644) ───────────────────────────
--
-- 위 스키마를 쓸 때는 8개 클럽을 "한 장씩만" 훑고 카테고리를 정했다. 이후
-- 24장을 전부 읽으면서 드러난 가정 오류 4개를 여기서 바로잡는다.

-- ---------------------------------------------------------------------------
-- 1) cognac 카테고리 복원
--
-- 642에서 "실물에 안 나온다"고 판단해 뺐는데, 틀렸다. BERMUDA는 "VODKA WHISKEY
-- COGNAC"을 한 섹션으로 묶어 놓아 첫 장만 봤을 때 눈에 안 띄었을 뿐이고, 실제로
-- Hennessy V.S.O.P 40만 / Louis XIII 1,200만이 있다. 이대로 두면 INSERT가
-- CHECK 제약에 걸려 거부된다.
-- ---------------------------------------------------------------------------
-- gin / rum도 마찬가지로 빠져 있었다. 그루브&스팟에 "진 GIN"(봄베이, 헨드릭스),
-- "럼 RUM"(론디아즈 151)이 독립 섹션으로 있다.
ALTER TABLE club_menu_items DROP CONSTRAINT IF EXISTS club_menu_items_category_check;
ALTER TABLE club_menu_items ADD CONSTRAINT club_menu_items_category_check
  CHECK (category IN (
    'champagne', 'liqueur', 'whisky', 'tequila', 'vodka',
    'cognac', 'gin', 'rum', 'set'
  ));

-- ---------------------------------------------------------------------------
-- 2) VVIP 플래그
--
-- BERMUDA에 "VVIP" 섹션이 따로 있다(Louis XIII 1,200만, Armand de Brignac 9L
-- 7,000만 등 11종). 이건 장르가 아니라 "가격대 등급"이라 카테고리 축과 성격이
-- 다르다 — Dom Pérignon Magnum은 champagne이면서 동시에 VVIP다.
--
-- 카테고리에 'vvip'를 넣으면 두 축이 섞여서 Dom Pérignon이 champagne 탭에서
-- 사라진다. 별도 플래그로 두면 장르 분류는 그대로 두고 화면에서 VVIP 탭만
-- 따로 뽑을 수 있다.
-- ---------------------------------------------------------------------------
ALTER TABLE club_menu_items
  ADD COLUMN IF NOT EXISTS is_vvip BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN club_menu_items.is_vvip IS
  'VVIP 섹션 품목 여부. category(장르)와 직교하는 등급 축 — 화면에서 별도 탭으로 노출.';

CREATE INDEX IF NOT EXISTS idx_club_menu_items_vvip
  ON club_menu_items (club_id, sort_order)
  WHERE is_active AND is_vvip;

-- ---------------------------------------------------------------------------
-- 3) 주말 가격
--
-- BERMUDA 세트는 같은 상품이 평일/주말 다른 값이다(A SET 평일 23만 / 주말 25만).
-- 642의 variants.price는 단일 값이라 표현이 안 된다.
--
-- 테이블 차지(clubs.table_charge_weekday/weekend)와 같은 축이지만 그건 클럽
-- 단위 부대비용이고 이건 상품 자체의 가격이라 별도로 둔다.
-- NULL이면 평일가와 동일하다는 뜻 — 요일 구분이 없는 대다수 품목은 NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE club_menu_variants
  ADD COLUMN IF NOT EXISTS price_weekend INTEGER
  CHECK (price_weekend IS NULL OR price_weekend > 0);

COMMENT ON COLUMN club_menu_variants.price IS
  '평일 가격(원). 요일 구분이 없는 품목은 이 값이 곧 상시 가격.';
COMMENT ON COLUMN club_menu_variants.price_weekend IS
  '주말 가격(원). NULL = 평일가와 동일.';

-- ---------------------------------------------------------------------------
-- 4) zone은 "선택 사항"이 아니라 필수였다
--
-- 642에서 "8곳 중 1곳뿐이라 컬럼만 만들어두고 안 채운다"고 적었는데, 그루브&스팟
-- 6장을 전부 읽어보니 같은 술이 층마다 가격이 다르다:
--
--   앱솔루트      3F EDM 200,000 / 2F 힙합 140,000
--   제임슨        3F EDM 170,000 / 2F 힙합 140,000
--   헤네시 VSOP   3F EDM 350,000 / 2F 힙합 280,000
--   딥 루미너스   3F EDM 200,000 / 2F 힙합 150,000
--
-- 즉 zone을 비워두면 한 클럽에 같은 이름의 항목이 값만 다르게 두 벌 들어가
-- 손님 화면에서 어느 게 자기 자리 가격인지 알 수 없다. 이런 클럽은 zone을
-- 반드시 채우고, 손님이 층을 먼저 고르게 해야 한다.
--
-- 조회 시 zone을 타게 인덱스를 보강한다(642의 인덱스는 zone을 모른다).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_club_menu_items_zone
  ON club_menu_items (club_id, zone, category, sort_order)
  WHERE is_active;


-- ############################################################################
-- 2부. 메뉴 데이터
-- ############################################################################


-- ============================================================================
-- Migration 645: 메뉴 데이터 — CLUB BERMUDA (홍대, 파트너 MD 11명)
--
-- 출처: clubs.drink_menu_urls 4장 (CHAMPAGNE / VODKA·WHISKEY·COGNAC·LIQUEUR·
--       TEQUILA / SET / VVIP)
--
-- 검수 포인트:
--   - 샴페인은 전부 "단품 + 3병 + 5병 + 10병" 4단 구조
--   - SET은 평일/주말 가격이 다름 → price / price_weekend
--   - VVIP 11종은 is_vvip = TRUE (카테고리는 장르 그대로)
--   - 테이블 차지: 평일 30,000 / 주말 50,000
-- ============================================================================

-- 재실행 안전: 이 클럽 데이터를 지우고 다시 넣는다.
DELETE FROM club_menu_items WHERE club_id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd';

UPDATE clubs
SET table_charge_weekday = 30000,
    table_charge_weekend = 50000
WHERE id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd';

-- ---------------------------------------------------------------------------
-- CHAMPAGNE — 단품 + 3/5/10병 세트
-- (name_en, name_ko, 단품가, 3병, 5병, 10병, 정렬)
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Lacour',                 '라쿠르',              150000,   400000,   700000,  1350000,  1),
  ('Pierlant',               '피얼란트',            200000,   550000,   950000,  1850000,  2),
  ('Respeck',                '리스펙',              230000,   650000,  1100000,  2150000,  3),
  ('Luc Belaire Rose',       '뤽 벨레어 로제',      250000,   700000,  1200000,  2350000,  4),
  ('King Cartes de Cour',    '킹 카르트 드 쿠어',   250000,   700000,  1200000,  2350000,  5),
  ('Queen Cartes de Cour',   '퀸 카르트 드 쿠어',   250000,   700000,  1200000,  2350000,  6),
  ('Deep Ice',               '딥 아이스',           250000,   700000,  1200000,  2350000,  7),
  ('Jean Pierre',            '장 피에르',           250000,   700000,  1200000,  2350000,  8),
  ('Sono',                   '소노',                250000,   700000,  1200000,  2350000,  9),
  ('Luc Belaire Gold',       '뤽 벨레어 골드',      250000,   700000,  1200000,  2350000, 10),
  ('Luc Belaire Lux',        '뤽 벨레어 룩스',      250000,   700000,  1200000,  2350000, 11),
  ('Luc Belaire Lux Rose',   '뤽 벨레어 룩스 로제', 300000,   850000,  1450000,  2900000, 12),
  ('Luc Belaire Lux Bleu',   '뤽 벨레어 룩스 블루', 300000,   850000,  1450000,  2900000, 13),
  ('Moët & Chandon',         '모엣 샹동',           300000,   850000,  1450000,  2900000, 14),
  ('Moët & Chandon N.I.R',   '모엣 샹동 니르',      400000,  1150000,  1950000,  3900000, 15),
  ('Jean Call Rubis',        '진콜 루비스',         900000,  2600000,  4400000,  8800000, 16),
  ('Dom Pérignon',           '돔 페리뇽',          1200000,  3500000,  5700000, 11000000, 17),
  ('Armand de Brignac',      '아르망 드 브리냑',   2000000,  5900000,  9900000, 19500000, 18)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'd912c171-7b9c-40a4-8c89-dc05caf35ebd', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle',      '1병',   src.p1,  1),
  ('3 bottle set',  '3병',   src.p3,  2),
  ('5 bottle set',  '5병',   src.p5,  3),
  ('10 bottle set', '10병',  src.p10, 4)
) AS v(label_en, label_ko, price, ord);

-- ---------------------------------------------------------------------------
-- VODKA / WHISKY / COGNAC / LIQUEUR / TEQUILA — 단품만
-- 메뉴판은 "VODKA WHISKEY COGNAC"을 한 섹션으로 묶었지만 장르별로 나눠 담는다.
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',   'Mirrors Vodka',      '미러스 보드카',      150000,  1),
  ('whisky',  'Label 5',            '라벨 5',             150000,  2),
  ('whisky',  'Jack Daniel''s',     '잭 다니엘',          200000,  3),
  ('whisky',  'Jack Daniel''s Honey','잭 다니엘 허니',    200000,  4),
  ('cognac',  'Hennessy V.S.O.P',   '헤네시 V.S.O.P',     400000,  5),
  ('whisky',  'Macallan 12',        '맥캘란 12년',        400000,  6),
  ('liqueur', 'Balu Coco',          '발루 코코',          150000,  7),
  ('liqueur', 'Sweet Peach',        '스위트 피치',        150000,  8),
  ('liqueur', 'Tina',               '티나',               200000,  9),
  ('liqueur', 'Jägermeister',       '예거마이스터',       200000, 10),
  ('liqueur', 'Cocalero',           '코카레로',           200000, 11),
  ('liqueur', 'Agwa',               '아그와',             200000, 12),
  ('liqueur', 'Hpnotiq',            '힙노틱',             200000, 13),
  ('tequila', 'Emisario',           '에미사리오',         150000, 14),
  ('tequila', 'Sierra',             '씨에라',             200000, 15),
  ('tequila', 'Jose Cuervo',        '호세 쿠엘보',        230000, 16)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'd912c171-7b9c-40a4-8c89-dc05caf35ebd', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- SET — 평일/주말 가격이 다르고, A·B SET은 선택형(CHOICE)
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, description, wd, we, ord) AS (VALUES
  ('A Set', 'A 세트', 'Choice 1 bottle + 1 champagne (La Cour)',  230000, 250000, 1),
  ('B Set', 'B 세트', 'Choice 2 bottles + 1 champagne (La Cour)', 530000, 550000, 2),
  ('C Set', 'C 세트', 'Tina x2 + Luc Belaire x2',                 680000, 700000, 3),
  ('Tina Set', '티나 세트', 'Tina Red + Yellow + Green',          580000, 600000, 4)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'd912c171-7b9c-40a4-8c89-dc05caf35ebd', 'set', name_en, name_ko, description, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, price_weekend, sort_order)
SELECT ins.id, 'Set', '세트', src.wd, src.we, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- A SET 선택 후보 (택1): 발루코코 / 미러스보드카 / 스위트피치 / 에미사리오
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Balu Coco',     '발루 코코',     1),
  ('Mirrors Vodka', '미러스 보드카', 2),
  ('Sweet Peach',   '스위트 피치',   3),
  ('Emisario',      '에미사리오',    4)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'
  AND i.name_en = 'A Set';

-- B SET 선택 후보 (택2): 씨에라 / 힙노틱 / 예거 / 코카레로 / 티나
-- slot_no 1,2 두 벌로 넣어 손님이 두 번 고르게 한다.
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, s.slot_no, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES (1), (2)) AS s(slot_no)
CROSS JOIN (VALUES
  ('Sierra',       '씨에라',       1),
  ('Hpnotiq',      '힙노틱',       2),
  ('Jägermeister', '예거마이스터', 3),
  ('Cocalero',     '코카레로',     4),
  ('Tina',         '티나',         5)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'
  AND i.name_en = 'B Set';

-- ---------------------------------------------------------------------------
-- VVIP — 장르는 그대로 두고 is_vvip 플래그만 세운다
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('champagne', 'Luc Belaire Lux Magnum',        '뤽 벨레어 룩스 매그넘',      600000,  1),
  ('champagne', 'Moët & Chandon Lightning Magnum','모엣 샹동 라이트닝 매그넘',  700000,  2),
  ('champagne', 'Luc Belaire 5 Bottle Set',      '뤽 벨레어 5병 세트',        1300000,  3),
  ('champagne', 'Dom Pérignon Magnum',           '돔 페리뇽 매그넘',          2800000,  4),
  ('champagne', 'Dom Pérignon Lady Gaga Magnum', '돔 페리뇽 레이디가가 매그넘',3000000,  5),
  ('champagne', 'Luc Belaire Rose 6L',           '뤽 벨레어 로제 6L',         4500000,  6),
  ('champagne', 'Armand de Brignac Magnum',      '아르망 드 브리냑 매그넘',    4500000,  7),
  ('cognac',    'Louis XIII',                    '루이 13세',                12000000,  8),
  ('champagne', 'Dom Pérignon Lady Gaga 3L',     '돔 페리뇽 레이디가가 3L',  15000000,  9),
  ('champagne', 'Armand de Brignac La Cled''Or', '아르망 드 브리냑 라클레도르',15000000, 10),
  ('champagne', 'Armand de Brignac 9L',          '아르망 드 브리냑 9L',      70000000, 11)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT 'd912c171-7b9c-40a4-8c89-dc05caf35ebd', category, name_en, name_ko, TRUE, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ============================================================================
-- Migration 646: 메뉴 데이터 — DM SEOUL (강남, 파트너 MD 5명)
--
-- 출처: drink_menu_urls 3장 중 2장
--   1장 SINGLE BOTTLE MENU (CHAMPAGNE / WHISKY / COGNAC / VODKA·TEQUILA·LIQUEUR)
--   3장 CHAMPAGNE SET MENU (3 / 5 / 10 bottles)
--
-- ⚠️ 2장(INTRO "SPECIAL EARLY SET")은 넣지 않았다.
--    로고가 INTRO이고 주소도 "언주로 172길"로, DM SEOUL(선릉로 157길)과 다르다.
--    다른 클럽 메뉴판이 잘못 업로드된 것으로 보여 확인 전까지 제외한다.
--
-- 테이블 차지: 5만원 (평일/주말 구분 없음)
-- ============================================================================

DELETE FROM club_menu_items WHERE club_id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7';

UPDATE clubs
SET table_charge_weekday = 50000,
    table_charge_weekend = 50000
WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7';

-- ---------------------------------------------------------------------------
-- CHAMPAGNE — 단품
-- 세트(3/5/10병)가 있는 5종은 아래 블록에서 variant를 더 붙인다.
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Deep Ice (Sweet)',            '딥 아이스 (스위트)',        250000,  1),
  ('Sono (Dry)',                  '소노 (드라이)',             250000,  2),
  ('Luc Belaire Gold',            '뤽 벨레어 골드',            300000,  3),
  ('Luc Belaire Luxe',            '뤽 벨레어 룩스',            350000,  4),
  ('Moët & Chandon',              '모엣 샹동',                 350000,  5),
  ('Moët & Chandon N.I.R',        '모엣 샹동 니르',            450000,  6),
  ('Moët & Chandon Gold Magnum',  '모엣 샹동 골드 매그넘',     900000,  7),
  ('Piper Heidsieck Rare',        '파이퍼 하이직 레어',        900000,  8),
  ('Dom Pérignon',                '돔 페리뇽',                1400000,  9),
  ('Dom Pérignon Rose',           '돔 페리뇽 로제',           2200000, 10),
  ('Armand de Brignac',           '아르망 드 브리냑',         2200000, 11),
  ('Armand de Brignac Rose',      '아르망 드 브리냑 로제',    3000000, 12)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 병수 세트가 있는 5종에 variant 추가 (3장 CHAMPAGNE SET MENU)
-- Armand de Brignac Gold = 위 'Armand de Brignac'와 동일 품목으로 본다.
WITH src(name_en, p3, p5, p10) AS (VALUES
  ('Deep Ice (Sweet)',      700000,  1150000,  2300000),
  ('Sono (Dry)',            700000,  1150000,  2300000),
  ('Piper Heidsieck Rare', 2600000,  4300000,  8600000),
  ('Dom Pérignon',         4100000,  6800000, 13600000),
  ('Armand de Brignac',    6200000, 10000000, 20000000)
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT i.id, v.label_en, v.label_ko, v.price, v.ord
FROM club_menu_items i
JOIN src ON src.name_en = i.name_en
CROSS JOIN LATERAL (VALUES
  ('3 bottle set',  '3병',  src.p3,  2),
  ('5 bottle set',  '5병',  src.p5,  3),
  ('10 bottle set', '10병', src.p10, 4)
) AS v(label_en, label_ko, price, ord)
WHERE i.club_id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7';

-- ---------------------------------------------------------------------------
-- WHISKY / COGNAC / VODKA / TEQUILA / LIQUEUR — 단품
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('whisky',  'Jack Daniel''s',      '잭 다니엘',            300000,  1),
  ('whisky',  'Glenfiddich 12Y',     '글렌피딕 12년',        450000,  2),
  ('whisky',  'Johnnie Walker Blue', '조니워커 블루',       1000000,  3),
  ('cognac',  'Hennessy V.S.O.P',    '헤네시 V.S.O.P',       500000,  4),
  ('cognac',  'Hennessy X.O',        '헤네시 X.O',          1200000,  5),
  ('cognac',  'Louis XIII',          '루이 13세',          20000000,  6),
  ('vodka',   'Stolichnaya',         '스톨리치나야',         250000,  7),
  ('vodka',   'Belvedere',           '벨베데어',             300000,  8),
  ('tequila', 'Sierra',              '씨에라',               250000,  9),
  ('tequila', 'Jose Cuervo',         '호세 쿠엘보',          350000, 10),
  ('tequila', 'Don Julio 1942',      '돈 훌리오 1942',      1000000, 11),
  ('tequila', 'Clase Azul',          '클라세 아줄',         1200000, 12),
  ('liqueur', 'Malibu',              '말리부',               250000, 13),
  ('liqueur', 'MUA',                 '무아',                 250000, 14),
  ('liqueur', 'Tina (Red/Yellow/Green)', '티나 (레드/옐로우/그린)', 250000, 15),
  ('liqueur', 'Feria (Sapphire/Rose)',   '페리아 (사파이어/로제)',  250000, 16),
  ('liqueur', 'Peachtree',           '피치트리',             250000, 17),
  ('liqueur', 'Jägermeister',        '예거마이스터',         300000, 18),
  ('liqueur', 'Agwa',                '아그와',               300000, 19)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ============================================================================
-- Migration 647: 메뉴 데이터 — OCEAN (홍대, 파트너 MD 5명)
--
-- 출처: drink_menu_urls 4장 — 평일판과 주말판이 별도 이미지로 되어 있다.
--   1장 WEEK END SET + SINGLE BOTTLE (주말)
--   2장 CHAMPAGNE SET 주말 삼페인 세트
--   3장 WEEK DAY SET + SINGLE BOTTLE (평일)
--   4장 CHAMPAGNE SET 평일 삼페인 세트
--
-- 단품 가격은 평일/주말이 같고, 세트만 다르다. price=평일 / price_weekend=주말.
-- 테이블 차지: 평일 50,000 / 주말 100,000
-- ============================================================================

DELETE FROM club_menu_items WHERE club_id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542';

UPDATE clubs
SET table_charge_weekday = 50000,
    table_charge_weekend = 100000
WHERE id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542';

-- ---------------------------------------------------------------------------
-- SINGLE BOTTLE — 평일/주말 동일가
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('tequila', 'Jose Cuervo',       '호세 쿠엘보',       200000,  1),
  ('vodka',   'Skyy Vodka',        '스카이 보드카',     150000,  2),
  ('liqueur', 'Peach Tree',        '피치 트리',         150000,  3),
  ('liqueur', 'Malibu',            '말리부',            150000,  4),
  ('liqueur', 'Tina',              '티나',              200000,  5),
  ('liqueur', 'Jägermeister',      '예거 마이스터',     200000,  6),
  ('liqueur', 'Cocalero',          '코카레로',          200000,  7),
  ('whisky',  'Jack Daniel''s',    '잭 다니엘',         200000,  8),
  ('liqueur', 'X-Rated',           '엑스 레이티드',     200000,  9),
  ('liqueur', 'Hpnotiq',           '힙노틱',            200000, 10),
  ('tequila', 'Volcan Blanco',     '볼칸 블랑코',       300000, 11)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'bd820f57-46b6-4d95-822a-4f0cf8e84542', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- CHAMPAGNE — SINGLE / 3 SET / 5 SET, 평일·주말 가격 분리
-- (단품은 두 판이 같고, 3·5 SET만 다르다)
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, p1, wd3, we3, wd5, we5, ord) AS (VALUES
  ('Carte de Cour Queen Rose', '카르트 드 쿠어 퀸 로제',  240000,  600000,  700000,  900000, 1100000,  1),
  ('Carte de Cour King Gold',  '카르트 드 쿠어 킹 골드',  250000,  700000,  750000, 1100000, 1150000,  2),
  ('Sono Blanc de Brignac',    '소노 블랑 드 브리냑',     250000,  700000,  750000, 1000000, 1150000,  3),
  ('Moët & Chandon Imperial',  '모엣 샹동 임페리얼',      250000,  700000,  750000, 1000000, 1150000,  4),
  ('Moët & Chandon N.I.R',     '모엣 샹동 니르',          400000, 1150000, 1200000, 1850000, 1900000,  5),
  ('Respeck Moscato',          '리스펙 모스카토',         230000,  600000,  700000,  900000, 1100000,  6),
  ('Carbonic Blue',            '카보닉 블루',             230000,  600000,  700000,  900000, 1100000,  7),
  ('Deep Ice Luminous',        '딥 아이스 루미너스',      250000,  700000,  750000, 1000000, 1150000,  8),
  ('Dom Pérignon Luminous',    '돔 페리뇽 루미너스',     1200000, 3500000, 3500000, 5700000, 5700000,  9),
  ('Armand de Brignac Gold',   '아르망 드 브리냑 골드',  1900000, 5500000, 5500000, 9000000, 9000000, 10)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'bd820f57-46b6-4d95-822a-4f0cf8e84542', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, price_weekend, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.price_we, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle',  '1병', src.p1,  NULL::INTEGER, 1),
  ('3 set',     '3병', src.wd3, src.we3,       2),
  ('5 set',     '5병', src.wd5, src.we5,       3)
) AS v(label_en, label_ko, price, price_we, ord);

-- 추가 단품 (평일·주말 SINGLE BOTTLE 목록에만 있고 세트가 없는 샴페인)
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Moët & Chandon',                  '모엣 샹동',                  250000, 11),
  ('Moët & Chandon Lightning Magnum', '모엣 샹동 라이트닝 매그넘',  600000, 12),
  ('Sono Blanc de Brignac (Single)',  '소노 블랑 드 브리냑 (단품)', 250000, 13)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'bd820f57-46b6-4d95-822a-4f0cf8e84542', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- HARD BOTTLE SET — 선택형(하드 택1 + 샴페인). 평일/주말 가격 다름.
--   평일 SET1 200,000 / SET2 250,000
--   주말 SET1 250,000 / SET2 400,000
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, description, wd, we, ord) AS (VALUES
  ('Hard Bottle Set 1', '하드 보틀 세트 1', '1 hard bottle (choice) + 1 champagne', 200000, 250000, 1),
  ('Hard Bottle Set 2', '하드 보틀 세트 2', '1 hard bottle (choice) + 1 champagne', 250000, 400000, 2)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'bd820f57-46b6-4d95-822a-4f0cf8e84542', 'set', name_en, name_ko, description, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, price_weekend, sort_order)
SELECT ins.id, 'Set', '세트', src.wd, src.we, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- SET 1 후보 (택1)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Tequila',               '테킬라',              1),
  ('Vodka',                 '보드카',              2),
  ('Balocco',               '발로코',              3),
  ('Mirror''s Sweet Peach', '미러스 스위트 피치',  4),
  ('Mirror''s Sweet Melon', '미러스 스위트 멜론',  5)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542'
  AND i.name_en = 'Hard Bottle Set 1';

-- SET 2 후보 (택1). 예거·코카레로·잭다니엘·엑스레이티드·힙노틱은 +50,000 업차지.
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, extra_price, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.extra, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Jose Cuervo',   '호세 쿠엘보',   0,     1),
  ('Skyy Vodka',    '스카이 보드카', 0,     2),
  ('Peach Tree',    '피치 트리',     0,     3),
  ('Malibu',        '말리부',        0,     4),
  ('Tina',          '티나',          0,     5),
  ('Rosa Bella',    '로사 벨라',     0,     6),
  ('Jägermeister',  '예거마이스터',  50000, 7),
  ('Cocalero',      '코카레로',      50000, 8),
  ('Jack Daniel''s','잭 다니엘',     50000, 9),
  ('X-Rated',       '엑스 레이티드', 50000, 10),
  ('Hpnotiq',       '힙노틱',        50000, 11)
) AS c(name_en, name_ko, extra, ord)
WHERE i.club_id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542'
  AND i.name_en = 'Hard Bottle Set 2';

-- ---------------------------------------------------------------------------
-- MOSCATO SET — 평일 한정 (condition_note)
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Moscato 1 Set', '모스카토 1 세트', 200000, 3),
  ('Moscato 2 Set', '모스카토 2 세트', 350000, 4),
  ('Moscato 3 Set', '모스카토 3 세트', 450000, 5)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT 'bd820f57-46b6-4d95-822a-4f0cf8e84542', 'set', name_en, name_ko,
         'Weekdays only', ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ============================================================================
-- Migration 648: 메뉴 데이터 — Club Ace (강남, 파트너 MD 10명)
--
-- 출처: drink_menu_urls 7장
--   1·7장 전체 가격표 (7장이 최신판 — Luc Belaire Rose/Luxe가 추가돼 있어 기준으로 씀)
--   2장   조합표 (샴페인 N + 하드 M, 총 65행)
--   3장   샴페인 병수 세트 (3/5/10)
--   4장   프리미엄 세트 (Louis XIII 조합 8종)
--   5·6장 단일 품목 광고 (Luc Belaire Rare Rosé 15L / Armand Swarovski Edition)
--
-- ⚠️ 잔 단위 음료(BEVERAGE 5,000 / SHOT 7,000 / MIX 10,000 / COCKTAIL 15,000)는
--    사장님 지시로 전부 제외했다. 테이블 예약에 붙는 건 병 단위다.
--
-- 표시가는 "상기가격은 VAT 10%가 포함된 가격입니다" — 세금 포함가 그대로 사용.
--
-- 테이블 차지: 없음(0). 메뉴판 7장 어디에도 차지 문구가 없고, 사장님이 MD에게
-- 확인해 "안 받는다"고 확정했다. NULL이 아니라 0으로 넣는 이유는 642에서
-- NULL을 "미확인"으로 정의했기 때문 — 0이어야 "확인했고 안 받음"이 된다.
-- ============================================================================

DELETE FROM club_menu_items WHERE club_id = '35de296e-5fdc-435b-baf2-1c7c05538687';
DELETE FROM club_menu_combos WHERE club_id = '35de296e-5fdc-435b-baf2-1c7c05538687';

UPDATE clubs
SET table_charge_weekday = 0,
    table_charge_weekend = 0
WHERE id = '35de296e-5fdc-435b-baf2-1c7c05538687';

-- ---------------------------------------------------------------------------
-- CHAMPAGNE — 단품 (7장 기준)
-- ---------------------------------------------------------------------------
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Illumi-Light',                '일루미 라이트',              350000,  1),
  ('Illumi-Light Ice',            '일루미 라이트 아이스',       350000,  2),
  ('Deep Ice',                    '딥 아이스',                  350000,  3),
  ('Cartes de Cour King',         '카르트 드 쿠어 킹',          350000,  4),
  ('Cartes de Cour Queen',        '카르트 드 쿠어 퀸',          350000,  5),
  ('Jean Pierre Brut',            '장 피에르 브뤼',             350000,  6),
  ('Luc Belaire Rose',            '뤽 벨레어 로제',             400000,  7),
  ('Luc Belaire Luxe',            '뤽 벨레어 룩스',             400000,  8),
  ('Moët & Chandon',              '모엣 샹동',                  400000,  9),
  ('Moët & Chandon N.I.R',        '모엣 샹동 니르',             600000, 10),
  ('Moët & Chandon Golden Light', '모엣 샹동 골든라이트',       900000, 11),
  ('Cuperly Fleur Grand Cru Brut','쿠퍼리 플뢰르 그랑크뤼 브뤼',1100000, 12),
  ('Richard Bavion Luminous',     '리차드 바비옹 루미너스',    1100000, 13),
  ('Jean Call Rubis',             '진콜 루비스',               1100000, 14),
  ('Piper Heidsieck Rare Luminous','파이퍼 하이직 레어 루미너스',1100000, 15),
  ('Perrier-Jouët Belle Epoque',  '페리에주에 벨에포크',       1500000, 16),
  ('Angel Rose',                  '엔젤 로제',                 1700000, 17),
  ('Perrier-Jouët Rosé',          '페리에주에 로제',           1900000, 18),
  ('Dom Pérignon Luminous',       '돔페리뇽 루미너스',         2000000, 19),
  ('Dom Pérignon Rosé',           '돔페리뇽 로제',             2200000, 20),
  ('Angel Gold',                  '엔젤 골드',                 2500000, 21),
  ('Dom Pérignon Magnum',         '돔페리뇽 매그넘',           3900000, 22)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '35de296e-5fdc-435b-baf2-1c7c05538687', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 샴페인 병수 세트 (3장). 위 단품 항목에 variant를 덧붙인다.
WITH src(name_en, p3, p5, p10) AS (VALUES
  ('Illumi-Light Ice',             1100000,  1750000,  3500000),
  ('Deep Ice',                     1100000,  1750000,  3500000),
  ('Jean Pierre Brut',             1100000,  1750000,  3500000),
  ('Cartes de Cour King',          1100000,  1750000,  3500000),
  ('Cartes de Cour Queen',         1100000,  1750000,  3500000),
  ('Moët & Chandon',               1250000,  2000000,  3900000),
  ('Cuperly Fleur Grand Cru Brut', 3200000,  5300000, 10600000),
  ('Jean Call Rubis',              3200000,  5300000, 10600000),
  ('Richard Bavion Luminous',      3200000,  5300000, 10600000),
  ('Piper Heidsieck Rare Luminous',3200000,  5300000, 10600000),
  ('Perrier-Jouët Belle Epoque',   4400000,  7300000, 14500000),
  ('Angel Rose',                   5000000,  8300000, 16500000),
  ('Dom Pérignon Luminous',        5900000,  9800000, 19600000),
  ('Perrier-Jouët Rosé',           5600000,  9300000, 18500000),
  ('Dom Pérignon Rosé',            6500000, 10800000, 21500000),
  ('Angel Gold',                   7400000, 12300000, 24600000)
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT i.id, v.label_en, v.label_ko, v.price, v.ord
FROM club_menu_items i
JOIN src ON src.name_en = i.name_en
CROSS JOIN LATERAL (VALUES
  ('3 bottle set',  '3병',  src.p3,  2),
  ('5 bottle set',  '5병',  src.p5,  3),
  ('10 bottle set', '10병', src.p10, 4)
) AS v(label_en, label_ko, price, ord)
WHERE i.club_id = '35de296e-5fdc-435b-baf2-1c7c05538687';

-- ---------------------------------------------------------------------------
-- ARMAND DE BRIGNAC (VVIP) + COGNAC + WHISKY + VODKA/TEQUILA/LIQUEUR
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, vvip, ord) AS (VALUES
  ('champagne', 'Armand Gold',            '아르망디 골드',        2500000, TRUE,  1),
  ('champagne', 'Armand Rosé',            '아르망디 로제',        3000000, TRUE,  2),
  ('champagne', 'Armand Demi-sec',        '아르망디 드미섹',      3000000, TRUE,  3),
  ('champagne', 'Armand Blanc de Blancs', '아르망디 블랑드블랑',  8000000, TRUE,  4),
  ('cognac',    'Louis XIII',             '루이 13세',           25000000, TRUE,  5),
  ('whisky',    'Jack Daniel''s Honey',   '잭다니엘 허니',         400000, FALSE, 6),
  ('whisky',    'Glenfiddich 12Y',        '글렌피딕 12년',         700000, FALSE, 7),
  ('whisky',    'Johnnie Walker Blue',    '조니워커 블루',        1200000, FALSE, 8),
  ('tequila',   'Don Julio 1942',         '돈훌리오 1942',        1200000, FALSE, 9),
  ('tequila',   'Clase Azul Reposado',    '클라세 아줄 레포사도', 1800000, FALSE, 10),
  ('tequila',   'Clase Azul San Luis Potosí','클라세 아줄 산루이스',3000000, FALSE, 11),
  ('tequila',   'Clase Azul Guerrero',    '클라세 아줄 게레로',   3000000, FALSE, 12),
  ('tequila',   'Volcan de mi Tierra X.A','볼칸 데킬라',          2500000, FALSE, 13),
  ('vodka',     'Snow Leopard Vodka',     '스노우 레오파드 보드카',400000, FALSE, 14),
  ('liqueur',   'Bols Pink Liqueur',      '볼스 핑크 리큐르',      400000, FALSE, 15),
  ('liqueur',   'Jägermeister',           '예거마이스터',          400000, FALSE, 16),
  ('liqueur',   'Lamp Liqueur',           '램프 리큐르',           400000, FALSE, 17),
  ('liqueur',   'Tina Liqueur',           '티나 리큐르',           400000, FALSE, 18),
  ('tequila',   'Sierra 2st Tequila',     '씨에라 데킬라',         400000, FALSE, 19),
  ('tequila',   'Patron Silver Tequila',  '페트론 실버 데킬라',    600000, FALSE, 20),
  ('tequila',   'Patron Anejo Tequila',   '페트론 아네조 데킬라', 1000000, FALSE, 21)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '35de296e-5fdc-435b-baf2-1c7c05538687', category, name_en, name_ko, vvip, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- PREMIUM SET (4장) + 단일 품목 광고 (5·6장) — 전부 VVIP
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('set', 'Piper Heidsieck Rare Luminous 3B + Louis XIII 1B', '파이퍼 하이직 레어 루미너스 3병 + 루이13세 1병', 27800000, 1),
  ('set', 'Richard Bavion 3B + Louis XIII 1B',                '리차드 바비옹 3병 + 루이13세 1병',               27800000, 2),
  ('set', 'Cuperly Luminous 3B + Louis XIII 1B',              '쿠퍼리 루미너스 3병 + 루이13세 1병',             27800000, 3),
  ('set', 'Perrier-Jouët 3B + Louis XIII 1B',                 '페리에주에 3병 + 루이13세 1병',                  29000000, 4),
  ('set', 'Armand de Brignac 2B + Louis XIII 1B',             '아르망 드 브리냑 2병 + 루이13세 1병',            29500000, 5),
  ('set', 'Dom Pérignon Luminous 3B + Louis XIII 1B',         '돔페리뇽 루미너스 3병 + 루이13세 1병',           30500000, 6),
  ('set', 'Armand de Rose 2B + Louis XIII 1B',                '아르망 로제 2병 + 루이13세 1병',                 30500000, 7),
  ('set', 'Armand de Demi-sec 2B + Louis XIII 1B',            '아르망 드미섹 2병 + 루이13세 1병',               30500000, 8),
  ('champagne', 'Luc Belaire Rare Rosé 15L',                  '뤽 벨레어 레어 로제 15L',                       12000000, 9),
  ('champagne', 'Armand de Brignac Swarovski Edition',        '아르망 드 브리냑 스와로브스키 에디션',          25000000, 10)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '35de296e-5fdc-435b-baf2-1c7c05538687', category, name_en, name_ko, TRUE, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- 조합표 (2장) — 샴페인 N + 하드 M, 총 65행
--
-- 가격 규칙이 완전히 규칙적이다:
--   총 T병일 때 기준가(샴페인만) + 하드 1병당 +50,000
--   기준가: 1병 400,000 / 2병 750,000 / 3병 1,100,000 / 4병 1,400,000 /
--           5병 1,750,000 / 6병 2,100,000 / 7병 2,450,000 / 8병 2,800,000 /
--           9병 3,150,000 / 10병 3,500,000
-- 이미지의 65행을 전부 대조해 이 규칙과 일치함을 확인했다.
-- ---------------------------------------------------------------------------
INSERT INTO club_menu_combos (club_id, cham_count, hard_count, price)
SELECT '35de296e-5fdc-435b-baf2-1c7c05538687',
       t.total - h.hard_count,
       h.hard_count,
       base.price + h.hard_count * 50000
FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS t(total)
JOIN LATERAL (VALUES
  (1, 400000), (2, 750000), (3, 1100000), (4, 1400000), (5, 1750000),
  (6, 2100000), (7, 2450000), (8, 2800000), (9, 3150000), (10, 3500000)
) AS base(n, price) ON base.n = t.total
JOIN LATERAL generate_series(0, t.total) AS h(hard_count) ON TRUE;


-- ============================================================================
-- Migration 649: 메뉴 데이터 — 그루브&스팟 (부산, 파트너 MD 4명)
--
-- 출처: drink_menu_urls 6장
--   1·3장 3F EDM ZONE (리큐르·샴페인 / 샴페인 세트)
--   2장   3F EDM ZONE (보드카·데킬라·진·럼·코냑·위스키)
--   4·6장 2F HIPHOP ZONE (보드카·데킬라·진·럼·코냑·위스키 / 리큐르·샴페인)
--   5장   2F HIPHOP ZONE 바틀 세트
--
-- ⚠️ 이 클럽은 층마다 가격이 다르다. zone을 반드시 채운다.
--    같은 앱솔루트가 3F 200,000 / 2F 140,000. zone 없이 넣으면 한 클럽에
--    같은 이름이 값만 다르게 두 벌 들어가 손님이 구분할 수 없다.
--
-- 가격 표기가 천원 단위 축약이다("200." = 200,000). 전부 환산해 넣었다.
--
-- 테이블 차지: 없음(0). 메뉴판 6장 어디에도 차지 문구가 없고, 사장님이 MD에게
-- 확인해 "안 받는다"고 확정했다. NULL이 아니라 0으로 넣는 이유는 642에서
-- NULL을 "미확인"으로 정의했기 때문 — 0이어야 "확인했고 안 받음"이 된다.
-- ============================================================================

DELETE FROM club_menu_items WHERE club_id = '0d24b754-6c1d-40f6-badd-b398d03a4b3f';

UPDATE clubs
SET table_charge_weekday = 0,
    table_charge_weekend = 0
WHERE id = '0d24b754-6c1d-40f6-badd-b398d03a4b3f';

-- ---------------------------------------------------------------------------
-- 3F : EDM ZONE
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Jägermeister',        '예거마이스터',   200000,  1),
  ('liqueur', 'Malibu',              '말리부',         200000,  2),
  ('liqueur', 'Kwai Feh Rich',       '콰이 페리치',    200000,  3),
  ('liqueur', 'Cuervo Mojito',       '쿠엘보 모히토',  200000,  4),
  ('liqueur', 'Cocalero',            '코카레로',       200000,  5),
  ('liqueur', 'Fireball',            '파이어볼',       200000,  6),
  ('liqueur', 'Agwa',                '아그와',         250000,  7),
  ('liqueur', 'Hpnotiq',             '힙노틱',         250000,  8),
  ('liqueur', 'X-Rated',             '엑스레이티드',   250000,  9),
  ('vodka',   'Absolut',             '앱솔루트',       200000, 10),
  ('vodka',   'Smirnoff',            '스미노프',       200000, 11),
  ('vodka',   'Grey Goose',          '그레이구스',     250000, 12),
  ('tequila', 'Sierra',              '씨에라',         200000, 13),
  ('tequila', 'Jose Cuervo',         '호세 쿠엘보',    200000, 14),
  ('gin',     'Bombay',              '봄베이',         200000, 15),
  ('gin',     'Hendrick''s',         '헨드릭스',       300000, 16),
  ('rum',     'Landiaz 151',         '론디아즈 151',   200000, 17),
  ('cognac',  'Hennessy V.S.O.P',    '헤네시 VSOP',    350000, 18),
  ('whisky',  'Jameson',             '제임슨',         170000, 19),
  ('whisky',  'Johnnie Walker Black','조니워커 블랙',  200000, 20),
  ('whisky',  'Jack Daniel''s',      '잭다니엘스',     200000, 21),
  ('whisky',  'Jack Daniel''s Honey','잭다니엘스 허니',200000, 22),
  ('whisky',  'Jack Daniel''s Apple','잭다니엘스 애플',200000, 23),
  ('whisky',  'Johnnie Walker Blue', '조니워커 블루',  1000000, 24)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '3F EDM ZONE', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 3F 샴페인 — 단품 + 보너스 세트(3+1 / 6+2 / 10) 또는 병수 세트(3/5/10)
-- "3+1"은 3병 값에 1병을 더 주는 구조라 라벨에 그대로 드러낸다.
WITH src(name_en, name_ko, p1, l2, p2, l3, p3, l4, p4, ord) AS (VALUES
  ('Deep Luminous',   '딥 루미너스',   200000, '3+1 bottles', 600000,  '6+2 bottles', 1200000, '10 bottles',    1550000, 1),
  ('King',            '킹',            200000, '3+1 bottles', 600000,  '6+2 bottles', 1200000, '10 bottles',    1550000, 2),
  ('Queen',           '퀸',            200000, '3+1 bottles', 600000,  '6+2 bottles', 1200000, '10 bottles',    1550000, 3),
  ('Aurora',          '오로라',        200000, '3+1 bottles', 600000,  '6+2 bottles', 1200000, '10 bottles',    1550000, 4),
  ('Moët & Chandon',  '모엣 샹동',     250000, '3 bottle set', 700000, '5 bottle set', 1200000, '10 bottle set', 2300000, 5),
  ('Moët N.I.R',      '모엣 니르',     350000, '3 bottle set',1000000, '5 bottle set', 1650000, '10 bottle set', 3250000, 6),
  ('Perrier Jouet',   '페리에주에 루미너스', 1000000, '3 bottle set',2900000, '5 bottle set', 4800000, '10 bottle set', 9500000, 7),
  ('Dom Perignon',    '돔페리뇽 루미너스',   1100000, '3 bottle set',3200000, '5 bottle set', 5300000, '10 bottle set',10500000, 8),
  ('Armand de',       '아르망디',            2200000, '3 bottle set',6400000, '5 bottle set',10000000, '10 bottle set',20000000, 9)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '3F EDM ZONE', 'champagne', name_en, name_ko, ord + 100
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle', '1병',     src.p1, 1),
  (src.l2,     src.l2,    src.p2, 2),
  (src.l3,     src.l3,    src.p3, 3),
  (src.l4,     src.l4,    src.p4, 4)
) AS v(label_en, label_ko, price, ord);

-- 3F 리큐르·샴페인 중 1장에만 있는 항목 보강
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('champagne', 'Moet Golden', '모엣 샹동 골든 라이트업', 600000, 120)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '3F EDM ZONE', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ---------------------------------------------------------------------------
-- 2F : HIPHOP ZONE — 같은 품목이지만 가격이 더 낮다
-- ---------------------------------------------------------------------------
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',   'Absolut',             '앱솔루트',        140000,  1),
  ('vodka',   'Smirnoff',            '스미노프',        140000,  2),
  ('vodka',   'Grey Goose',          '그레이구스',      190000,  3),
  ('tequila', 'Sierra',              '씨에라',          140000,  4),
  ('tequila', 'Jose Cuervo',         '호세 쿠엘보',     140000,  5),
  ('gin',     'Bombay',              '봄베이',          160000,  6),
  ('gin',     'Hendrick''s',         '헨드릭스',        230000,  7),
  ('rum',     'Landiaz 151',         '론디아즈 151',    140000,  8),
  ('cognac',  'Hennessy V.S.O.P',    '헤네시 VSOP',     280000,  9),
  ('whisky',  'Jameson',             '제임슨',          140000, 10),
  ('whisky',  'Johnnie Walker Black','조니워커 블랙',   170000, 11),
  ('whisky',  'Jack Daniel''s',      '잭다니엘스',      170000, 12),
  ('whisky',  'Jack Daniel''s Honey','잭다니엘스 허니', 170000, 13),
  ('whisky',  'Jack Daniel''s Apple','잭다니엘스 애플', 170000, 14),
  ('whisky',  'Johnnie Walker Blue', '조니워커 블루',  1000000, 15),
  ('liqueur', 'Jägermeister',        '예거마이스터',    140000, 16),
  ('liqueur', 'Malibu',              '말리부',          140000, 17),
  ('liqueur', 'Kwai Feh Rich',       '콰이 페리치',     140000, 18),
  ('liqueur', 'Cuervo Mojito',       '쿠엘보 모히토',   140000, 19),
  ('liqueur', 'Cocalero',            '코카레로',        160000, 20),
  ('liqueur', 'Fireball',            '파이어볼',        170000, 21),
  ('liqueur', 'Agwa',                '아그와',          180000, 22),
  ('liqueur', 'Hpnotiq',             '힙노틱',          180000, 23),
  ('liqueur', 'X-Rated',             '엑스레이티드',    190000, 24)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '2F HIPHOP ZONE', category, name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 2F 샴페인 단품
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Opera Prima Brut', '오페라 프리마 브뤼',        80000, 101),
  ('Deep Luminous',    '딥 루미너스',              150000, 102),
  ('King',             '킹',                       150000, 103),
  ('Queen',            '퀸',                       150000, 104),
  ('Aurora',           '오로라',                   150000, 105),
  ('Moët & Chandon',   '모엣 샹동',                200000, 106),
  ('Moët N.I.R',       '모엣 니르',                300000, 107),
  ('Moet Golden',      '모엣 샹동 골든 라이트업',  600000, 108),
  ('Perrier Jouet',    '페리에주에 루미너스',     1000000, 109),
  ('Dom Perignon',     '돔페리뇽 루미너스',       1000000, 110),
  ('Armand de',        '아르망디',                2000000, 111)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '2F HIPHOP ZONE', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 2F 바틀 세트 (5장). "서비스" 병과 안주가 포함된 구성이라 description에 적는다.
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Deep Luminous Set',     '딥 루미너스 SET',     'Deep Luminous x3 + 1 free + snacks',            500000, 201),
  ('Aurora Set',            '오로라 SET',          'Aurora x3 + 1 free + snacks',                   500000, 202),
  ('Queen Set',             '퀸 SET',              'Queen x3 + 1 free + snacks',                    500000, 203),
  ('King Set',              '킹 SET',              'King x3 + 1 free + snacks',                     500000, 204),
  ('Jack Daniel''s Set',    '잭다니엘스 SET',      'Jack Daniel''s + Opera Prima Brut (free) + snacks', 200000, 205),
  ('Jack Daniel''s Honey Set','잭다니엘스 허니 SET','Jack Daniel''s Honey + Opera Prima Brut (free) + snacks', 200000, 206),
  ('Jack Daniel''s Apple Set','잭다니엘스 애플 SET','Jack Daniel''s Apple + Opera Prima Brut (free) + snacks', 200000, 207),
  ('Hennessy VSOP Set',     '헤네시 VSOP SET',     'Hennessy VSOP + Opera Prima Brut (free)',       280000, 208)
),
ins AS (
  INSERT INTO club_menu_items (club_id, zone, category, name_en, name_ko, description, sort_order)
  SELECT '0d24b754-6c1d-40f6-badd-b398d03a4b3f', '2F HIPHOP ZONE', 'set', name_en, name_ko, description, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ############################################################################
-- 3부. 잘못 올라간 메뉴판 이미지 제거
-- ############################################################################
--
-- DM SEOUL의 drink_menu_urls 3장 중 2번째가 다른 클럽 메뉴판이다:
--   로고가 "INTRO", 주소가 "B1, 65, EONJU-RO 172-GIL"
--   → DM SEOUL 실제 주소는 "B1F, 14, SEOLLEUNG-RO 157-GIL"
--
-- 손님이 /en 클럽 상세에서 이 사진을 보면 다른 가게 가격표를 보게 되므로
-- 배열에서 뺀다. Storage 파일 자체는 지우지 않는다 — 원래 어느 클럽 것인지
-- 확인되면 그 클럽에 붙일 수 있고, 잘못 지우면 복구가 안 된다.
UPDATE clubs
SET drink_menu_urls = array_remove(
      drink_menu_urls,
      'https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/club-menus/cc7db051-b75d-4c1f-9f95-29f7d8ce70d7/1782909990550-x7pc8w.jpg'
    )
WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7';

-- drink_menu_url(단수, 하위 호환 컬럼)이 지워진 URL을 가리키고 있으면 첫 장으로 되돌린다.
-- 지금은 1번째를 가리키고 있어 해당 없지만, 재실행/순서 변경에 안전하도록 둔다.
UPDATE clubs
SET drink_menu_url = drink_menu_urls[1]
WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7'
  AND (drink_menu_url IS NULL OR NOT (drink_menu_url = ANY(drink_menu_urls)))
  AND cardinality(drink_menu_urls) > 0;
