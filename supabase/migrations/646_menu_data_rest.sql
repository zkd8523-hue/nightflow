-- ============================================================================
-- Migration 646: 메뉴 데이터 — 나머지 24개 클럽
--
-- 642에서 5곳(BERMUDA·DM SEOUL·OCEAN·Club Ace·그루브&스팟)을 넣었고, 여기서
-- 메뉴판 사진이 있는 나머지 24곳을 채운다. 사진 74장을 읽어 옮긴 것이다.
--
-- 지역: 강남 8 · 이태원 8 · 홍대 5 · 광주 2 · 부산 2 · 대구 1 · 대전 1
-- (광주 Libertine·Veil은 작업 중 사진이 올라와 뒤늦게 합류했다. 나머지 광주 2곳과
--  수원 2곳은 아직 메뉴판 사진이 없어 범위 밖 — 사진을 올리면 같은 방식으로 넣는다)
--
-- ⚠️ 645(wine 카테고리)를 먼저 적용해야 한다 — Hilo·Paper의 병 단위 와인이
--    wine 카테고리를 쓴다. 안 그러면 CHECK 제약에 걸려 전체가 실패한다.
--
-- 읽으면서 확인된 것들:
--   · 잔 단위(칵테일·샷·맥주·음료)는 전량 제외 — 테이블 예약에 붙는 건 병이다
--   · 천원/만원 단위 축약 표기가 흔하다("200." = 200,000, "70 Krw" = 700,000)
--   · 메뉴판 자체 오기 3건을 이미지와 대조해 정정(주석에 남김)
--   · 가격이 "문의"이거나 조명 반사로 안 읽히는 항목은 지어내지 않고 제외
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- club_menu_items / variants / choices seed — group1
-- ═══════════════════════════════════════════════════════════════════


-- ═══ HYPE SEOUL (강남) ═══
-- 출처: 사진 8장 (SINGLE BOTTLE 3장, CHAMPAGNE SET 4장, HYPE BOTTLE SET 1장)
-- 특이사항: 세트 가격표가 만원 단위 축약 표기(예: "3 Bottle 70 Krw" = 700,000원).
--           단품가와 교차검증 완료(모엣 35만×3 ≈ 세트 100만).
--           테이블차지 50,000원(평일/주말 동일).

UPDATE clubs SET table_charge_weekday = 50000, table_charge_weekend = 50000
WHERE id = '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae';

DELETE FROM club_menu_items WHERE club_id = '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae';

-- ── 단품 전용 (1병만 판매) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur',   'Jägermeister',              '예거마이스터',        250000,  1),
  ('liqueur',   'Jägermeister Orange',       '예거마이스터 오렌지',  250000,  2),
  ('whisky',    'Jim Beam',                  '짐빔',               300000,  3),
  ('liqueur',   'Malibu',                    '말리부',             250000,  4),
  ('vodka',     'Absolut Vodka',             '앱솔루트 보드카',      250000,  7),
  ('vodka',     'Grey Goose',                '그레이 구스',         300000,  8),
  ('gin',       'Bombay Sapphire',           '봄베이 사파이어',      300000,  9),
  ('tequila',   'Jose Cuervo',               '호세쿠엘보',          300000, 10),
  ('tequila',   'Don Julio Blanco',          '돈훌리오 블랑코',      400000, 11),
  ('tequila',   'Patrón Silver',             '페트론 실버',         450000, 12),
  ('tequila',   'Don Julio 1942',            '돈 훌리오 1942',     1100000, 13),
  ('tequila',   'Patrón El Alto',            '페트론 엘 알토',     1100000, 14),
  ('tequila',   '1800 Milenio',              '1800 밀레니오',      1200000, 15),
  ('tequila',   'Clase Azul Reposado',       '클라세 아줄 레포사도', 1200000, 16),
  ('tequila',   'Clase Azul Gold',           '클라세 아줄 골드',    1800000, 17),
  ('whisky',    'Balvenie 12 Year',          '발베니 12년',         450000, 18),
  ('whisky',    'Johnnie Walker Blue Label', '조니워커 블루 라벨',  1200000, 19),
  ('whisky',    'Royal Salute 21 Year',      '로얄살루트 21년',    1000000, 20),
  ('cognac',    'Hennessy V.S.O.P',          '헤네시 VSOP',         500000, 21),
  ('cognac',    'Hennessy X.O',              '헤네시 XO',          1300000, 22),
  ('cognac',    'Louis XIII',                '루이 13세',         20000000, 23),
  ('champagne', 'Moët & Chandon Brut Impérial', '모엣 샹동 브뤼 임페리얼', 350000, 30),
  ('champagne', 'Armand de Brignac Gold',    '아르망 드 브리냑 골드', 2200000, 31)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── 병수 세트가 있는 항목 (1 / 3 / 5 / 10병) ──
WITH src(category, name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('liqueur',   'MUA Zero Sugar',            '무아 제로 슈거',       250000,  700000, 1200000,  2300000,  5),
  ('liqueur',   'TINA Liqueur',              '티나',                250000,  700000, 1200000,  2300000,  6),
  ('champagne', 'Illumi Light',              '일루미 라이트',        250000,  700000, 1200000,  2300000, 40),
  ('champagne', 'Illumi Light Ice',          '일루미 라이트 아이스',  250000,  700000, 1200000,  2300000, 41),
  ('champagne', 'Illumi Light Rose',         '일루미 라이트 로제',    350000, 1000000, 1650000,  3200000, 42),
  ('champagne', 'Montelvini',                '몬텔비니',            250000,  700000, 1200000,  2300000, 43),
  ('champagne', 'Deep Ice Luminus',          '딥 아이스 루미너스',    250000,  700000, 1200000,  2300000, 44),
  ('champagne', 'Sono Electric Luminus Edition', '소노 일렉트릭 루미너스 에디션', 250000, 700000, 1200000, 2300000, 45),
  ('champagne', 'Moët & Chandon N.I.R',      '모엣 샹동 니르',       450000, 1300000, 2200000,  4300000, 46),
  ('champagne', 'Dom Pérignon Luminous',     '돔 페리뇽 루미너스',   1400000, 4000000, 6500000, 12500000, 47)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),
  ('5 bottle set','5병',src.p5,3),('10 bottle set','10병',src.p10,4)
) AS v(label_en, label_ko, price, ord);

-- ── 3/5/10병 세트만 있는 항목 (단품가는 이미 위에서 별도 등록) ──
-- Moët & Chandon Brut Impérial 세트 (모엣 샹동)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('67b2286c-63e9-46a1-bb90-e9ca4ccf6fae', 'champagne',
          'Moët & Chandon Brut Impérial Set', '모엣 샹동 브뤼 임페리얼 세트', 48)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins
CROSS JOIN (VALUES
  ('3 bottle set','3병',1000000,1),('5 bottle set','5병',1600000,2),
  ('10 bottle set','10병',3000000,3)
) AS v(label_en, label_ko, price, ord);

-- Armand de Brignac Gold 세트
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('67b2286c-63e9-46a1-bb90-e9ca4ccf6fae', 'champagne',
          'Armand de Brignac Gold Set', '아르망 드 브리냑 골드 세트', 49)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins
CROSS JOIN (VALUES
  ('3 bottle set','3병',6000000,1),('5 bottle set','5병',10000000,2),
  ('10 bottle set','10병',20000000,3)
) AS v(label_en, label_ko, price, ord);


-- ═══ 코어라운지 / CORE SEOUL (강남) ═══
-- 출처: 사진 4장 (PRICE LIST 3장, LOCATION MAP 1장 — 지도는 메뉴 아님)
-- 특이사항: 샴페인은 1/2/5병 세트 구조. WELCOME SET 2종은 선택형
--           (앱솔루트 → 말리부 or 제임슨 변경 가능) → club_menu_choices 사용.
--           테이블차지 50,000원(테이블·룸 이용 시).
--           ※ 메뉴판 브랜딩은 CORE SEOUL / core.apgu.seoul (압구정), 주소 14-8 SEOLLEUNG-RO 157-GIL.

UPDATE clubs SET table_charge_weekday = 50000, table_charge_weekend = 50000
WHERE id = '41cdc939-dd08-4d15-bb6e-ad4ae94b6b26';

DELETE FROM club_menu_items WHERE club_id = '41cdc939-dd08-4d15-bb6e-ad4ae94b6b26';

-- ── 샴페인 (1 / 2 / 5병) ──
WITH src(name_en, name_ko, p1, p2, p5, ord) AS (VALUES
  ('Moët & Chandon N.I.R',        '모엣 니르',            500000,  900000,  2200000, 1),
  ('Perrier-Jouët Belle Epoque',  '페리에주에 벨에포크 루미너스', 1200000, 2100000,  5000000, 2),
  ('Dom Pérignon Luminous',       '돔 페리뇽 루미너스',   1400000, 2600000,  6000000, 3),
  ('Armand de Brignac',           '아르망 드 브리냑',    2200000, 4200000, 10000000, 4),
  ('Jean Pierre',                 '장 피에르',            250000,  500000,  1200000, 5),
  ('Trixon Brut',                 '트릭슨 브뤼',          250000,  500000,  1200000, 6),
  ('Luc Belaire Rose',            '룩 벨레어 로제',       300000,  550000,  1300000, 7),
  ('Luc Belaire Luxe',            '룩 벨레어 럭스',       300000,  550000,  1300000, 8),
  ('G.H. Mumm',                   'G.H. 멈',             350000,  600000,  1400000, 9)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '41cdc939-dd08-4d15-bb6e-ad4ae94b6b26', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('2 bottle set','2병',src.p2,2),('5 bottle set','5병',src.p5,3)
) AS v(label_en, label_ko, price, ord);

-- ── 단품 (리큐르 / 위스키 / 데킬라 / 보드카) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'TINA',                     '티나',            250000, 20),
  ('liqueur', 'Malibu',                   '말리부',          250000, 21),
  ('liqueur', 'Cocalero',                 '코카레로',        250000, 22),
  ('whisky',  'Jameson',                  '제임슨',          250000, 23),
  ('whisky',  'Ballantine''s 17Y',        '발렌타인 17년',    450000, 24),
  ('whisky',  'Ballantine''s 21Y',        '발렌타인 21년',    800000, 25),
  ('whisky',  'Johnnie Walker Blue Label','조니워커 블루라벨', 1200000, 26),
  ('tequila', 'Sierra Reposado',          '시에라 레포사도',   250000, 27),
  ('tequila', 'Olmeca Altos',             '올메카 알토스',     300000, 28),
  ('tequila', 'Clase Azul',               '클라세 아줄',     1200000, 29),
  ('vodka',   'Absolut',                  '앱솔루트',        250000, 30),
  ('vodka',   'Belvedere',                '벨베디어',        300000, 31)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '41cdc939-dd08-4d15-bb6e-ad4ae94b6b26', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── WELCOME SET (선택형: 앱솔루트 → 말리부 or 제임슨 변경 가능) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  VALUES ('41cdc939-dd08-4d15-bb6e-ad4ae94b6b26', 'set',
          'Welcome Set 2 Bottle', '웰컴 세트 2병',
          '장 피에르 + 앱솔루트',
          '*앱솔루트 ⇒ 말리부 or 제임슨으로 변경가능', 40)
  RETURNING id
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, '2 bottle set', '2병 세트', 450000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord FROM ins
CROSS JOIN (VALUES
  ('Absolut','앱솔루트',1),('Malibu','말리부',2),('Jameson','제임슨',3)
) AS c(name_en, name_ko, ord);

WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  VALUES ('41cdc939-dd08-4d15-bb6e-ad4ae94b6b26', 'set',
          'Welcome Set 3 Bottle', '웰컴 세트 3병',
          '룩 벨레어 로제 + 앱솔루트 2병',
          '*앱솔루트 ⇒ 말리부 or 제임슨으로 변경가능', 41)
  RETURNING id
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, '3 bottle set', '3병 세트', 650000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord FROM ins
CROSS JOIN (VALUES
  ('Absolut','앱솔루트',1),('Malibu','말리부',2),('Jameson','제임슨',3)
) AS c(name_en, name_ko, ord);


-- ═══ K-bat 빠따 (홍대) ═══
-- 출처: 사진 3장 (CHAMPAGNE SET 1장, SINGLE BOTTLE 1장, BOTTLE 1장)
-- 특이사항: 3장의 브랜딩이 서로 다름 — 2번 사진은 "DOKKAEBI PARTY HOUSE" 로고,
--           1·3번은 로고 없음. 3번(BOTTLE) 가격대가 1·2번 대비 현저히 저렴(10~65만).
--           동일 클럽의 다른 시기/다른 존 메뉴일 가능성 → zone으로 분리 표기함.
--           샴페인 세트 주문 시 Emisario/Sierra 추가 옵션(각 10만/15만) 존재.
--           테이블차지 문구 없음 → clubs 미수정.

DELETE FROM club_menu_items WHERE club_id = 'fa3c81f0-29ab-4756-8f87-8c681b5cde10';

-- ── CHAMPAGNE SET (3 / 5 / 10병) ──
WITH src(name_en, name_ko, p3, p5, p10, ord) AS (VALUES
  ('Respeck',          '리스펙',           600000,  900000, 1700000, 1),
  ('Luc Belaire Rose', '룩 벨레어 로제',    650000, 1050000, 2000000, 2),
  ('Luc Belaire Luxe', '룩 벨레어 럭스',    700000, 1100000, 2100000, 3),
  ('Moët & Chandon N.I.R', '모엣 상동 니르', 1000000, 1500000, 3000000, 4),
  ('Dom Pérignon',     '돔 페리뇽',       2700000, 4600000, 9000000, 5)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT 'fa3c81f0-29ab-4756-8f87-8c681b5cde10', 'champagne', name_en, name_ko,
         '샴페인 세트 주문 시 에미사리오 100,000원 / 시에라 150,000원 추가 가능', ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('3 bottle set','3병',src.p3,1),('5 bottle set','5병',src.p5,2),
  ('10 bottle set','10병',src.p10,3)
) AS v(label_en, label_ko, price, ord);

-- ── SINGLE BOTTLE (사진 2 · DOKKAEBI PARTY HOUSE 표기) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('champagne', 'Respeck',                        '리스펙',                220000, 10),
  ('champagne', 'Luc Belaire Rose',               '룩벨레어 로제',          230000, 11),
  ('champagne', 'Luc Belaire Luxe',               '룩벨레어 럭스',          250000, 12),
  ('champagne', 'Moët & Chandon N.I.R',           '모엣 샹동 NIR',         350000, 13),
  ('champagne', 'Moët & Chandon Lightning Magnum','모엣 라이트닝 매그넘',    800000, 14),
  ('champagne', 'Dom Pérignon',                   '돔페리뇽',             1200000, 15),
  ('champagne', 'Armand de Brignac',              '아르망 드 브리냑',      1800000, 16)
),
ins AS (
  -- zone은 "층마다 가격표가 다른 클럽"용이다. 여기 두 목록은 층이 아니라 서로 다른
  -- 술 목록(브랜딩·가격대가 다름 — 아래 주석 참고)이라 zone을 쓰면 손님 화면에
  -- 엉뚱한 "층 선택" 단계가 뜬다. 한 목록으로 합쳐 넣는다.
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'fa3c81f0-29ab-4756-8f87-8c681b5cde10', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── BOTTLE (사진 3 · 저가 라인) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('whisky',  'Jack Daniel''s',              '잭 다니엘',           100000, 30),
  ('whisky',  'Jameson',                     '제임슨',             100000, 31),
  ('whisky',  'Fireball',                    '파이어볼',           100000, 32),
  ('tequila', 'Sierra',                      '시에라',             100000, 33),
  ('gin',     'Bombay Sapphire',             '봄베이 사파이어',      100000, 34),
  ('vodka',   'Absolut',                     '앱솔루트',           100000, 35),
  ('liqueur', 'G-Tina',                      '지티나',             100000, 36),
  ('liqueur', 'Sweet Peach',                 '스위트 피치',         100000, 37),
  ('liqueur', 'Balu Coco',                   '발루 코코',          100000, 38),
  ('liqueur', 'Übermeister',                 '우버마이스터',        100000, 39),
  ('whisky',  'Johnnie Walker Black Label',  '조니워커 블랙라벨',    150000, 40),
  ('liqueur', 'Agwa',                        '아그와',             150000, 41),
  ('liqueur', 'Hpnotiq',                     '히프노틱',           150000, 42),
  ('cognac',  'Hennessy V.S.O.P',            '헤네시 VSOP',        200000, 43),
  ('liqueur', 'X-Rated',                     '엑스레이티드',        200000, 44),
  ('tequila', '1800 Reposado',               '1800 레포사도',      250000, 45),
  ('vodka',   'Grey Goose',                  '그레이 구스',         250000, 46),
  ('whisky',  'Johnnie Walker Blue Label',   '조니워커 블루라벨',    650000, 47)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'fa3c81f0-29ab-4756-8f87-8c681b5cde10', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ ADD (홍대) ═══
-- 출처: 사진 2장 (BOTTLE SET 1장, CHAMPAGNE SET 1장)
-- 특이사항: 가격이 만원 단위 축약 표기("200.0" = 200,000원, "2.100.0" = 2,100,000원).
--           BOTTLE SET은 전형적인 선택형 세트 — 선택N + 샴페인N 구성.
--           선택 후보는 NO EXTRA CHARGE / +30,000 / +100,000 3개 등급.
--           ⚠ +100,000 등급의 술 이름 텍스트가 이미지 하단에서 잘려 판독 불가
--             (병 사진만 3개 보임) → 해당 후보는 추가하지 않음.
--           테이블차지 문구 없음 → clubs 미수정.

DELETE FROM club_menu_items WHERE club_id = 'fb5edbac-ddef-4695-96e6-af047071f20f';

-- ── BOTTLE SET 4종 (선택형) ──
-- slot_no 1 = "선택(Choice)" 슬롯 후보 (기본 무료 7종 + 업차지 6종)
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Bottle Set 2', '2병 세트', '선택 1 + 샴페인 1', 200000, 1),
  ('Bottle Set 3', '3병 세트', '선택 2 + 샴페인 1', 300000, 2),
  ('Bottle Set 4', '4병 세트', '선택 2 + 샴페인 2', 350000, 3),
  ('Bottle Set 6', '6병 세트', '선택 3 + 샴페인 3', 500000, 4)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'fb5edbac-ddef-4695-96e6-af047071f20f', 'set', name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, 'set', '세트', src.price, 1
  FROM ins JOIN src ON src.name_en = ins.name_en
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, extra_price, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.extra, c.ord
FROM ins
CROSS JOIN (VALUES
  ('Jägermeister',        '예거마이스터',      0,      1),
  ('Jose Cuervo',         '호세 쿠엘보',       0,      2),
  ('Bombay Sapphire',     '봄베이 사파이어',    0,      3),
  ('Peachtree',           '피치트리',          0,      4),
  ('Skyy Cherry',         '스카이 체리',       0,      5),
  ('Skyy Peach',          '스카이 피치',       0,      6),
  ('Malibu',              '말리부',           0,      7),
  ('Jack Daniel''s Honey','잭다니엘 허니',  30000,     8),
  ('Jack Daniel''s Apple','잭다니엘 애플',  30000,     9),
  ('Jack Daniel''s',      '잭다니엘',       30000,    10),
  ('Agwa',                '아그와',        30000,    11),
  ('Hpnotiq',             '히노틱',        30000,    12),
  ('X-Rated',             '엑스레이티드',   30000,    13)
) AS c(name_en, name_ko, extra, ord);

-- ── CHAMPAGNE SET ──
-- 이름 없는 하우스 샴페인(1병 79,000 / 5병 350,000)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('fb5edbac-ddef-4695-96e6-af047071f20f', 'champagne',
          'House Champagne', '하우스 샴페인', 10)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins
CROSS JOIN (VALUES
  ('1 bottle','1병',79000,1),('5 bottle set','5병',350000,2)
) AS v(label_en, label_ko, price, ord);

WITH src(name_en, name_ko, p1, p3, ord) AS (VALUES
  ('Moët & Chandon',           '모엣 샹동',          189000,  500000, 11),
  ('Moët & Chandon Luminous',  '모엣 샹동 루미너스',  209000,  550000, 12),
  ('Dom Pérignon Luminous',    '돔페리뇽 루미너스',   800000, 2100000, 13),
  ('Armand de Brignac',        '아르망디',          1500000, 4200000, 14)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'fb5edbac-ddef-4695-96e6-af047071f20f', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2)
) AS v(label_en, label_ko, price, ord);


-- ═══ Fountain (이태원) ═══
-- 출처: 사진 1장 (A/B/C Set 구성표)
-- 특이사항: 전체가 선택형 세트 3종. 각 세트는 "병 1개 선택 + 드링크 3 + 치즈플레이트" 구성.
--           B/C 세트는 샴페인이 고정 포함(B=GH Mumm, C=Champagne).
--           개별 병 단가는 메뉴판에 없음 → variant는 세트가 1개씩만.
--           테이블차지 문구 없음 → clubs 미수정.

DELETE FROM club_menu_items WHERE club_id = '28f49c9b-377e-4d0d-8b2f-32f9519e245c';

-- A Set
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  VALUES ('28f49c9b-377e-4d0d-8b2f-32f9519e245c', 'set',
          'A Set', 'A 세트', 'Bottle 1 + Drink 3 + Cheese Plate', 1)
  RETURNING id
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, 'A Set', 'A 세트', 189000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord FROM ins
CROSS JOIN (VALUES
  ('Jim Beam','짐빔',1),('Bombay Sapphire','봄베이 사파이어',2),('Malibu','말리부',3),
  ('Absolut','앱솔루트',4),('Grey Goose','그레이 구스',5),('1800 Silver','1800 실버',6),
  ('Jägermeister','예거마이스터',7),('Jameson','제임슨',8)
) AS c(name_en, name_ko, ord);

-- B Set (GH Mumm 샴페인 고정 + 선택 1병)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  VALUES ('28f49c9b-377e-4d0d-8b2f-32f9519e245c', 'set',
          'B Set', 'B 세트', 'GH Mumm Champagne + Bottle 1 + Drink 3 + Cheese Plate', 2)
  RETURNING id
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, 'B Set', 'B 세트', 329000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord FROM ins
CROSS JOIN (VALUES
  ('Maker''s Mark','메이커스 마크',1),('Bombay Sapphire','봄베이 사파이어',2),
  ('Malibu','말리부',3),('Absolut','앱솔루트',4),('Grey Goose','그레이 구스',5),
  ('1800 Silver','1800 실버',6),('Jägermeister','예거마이스터',7),('Jameson','제임슨',8)
) AS c(name_en, name_ko, ord);

-- C Set (샴페인 고정 + 선택 1병, 위스키 라인)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  VALUES ('28f49c9b-377e-4d0d-8b2f-32f9519e245c', 'set',
          'C Set', 'C 세트', 'Champagne + Bottle 1 + Drink 3 + Cheese Plate', 3)
  RETURNING id
), v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, 'C Set', 'C 세트', 329000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord FROM ins
CROSS JOIN (VALUES
  ('Aberlour 12Y','아벨라워 12년',1),('Glendronach 12Y','글렌드로낙 12년',2),
  ('Glenlivet 12Y','글렌리벳 12년',3),('Bushmills 12Y','부시밀 12년',4),
  ('Macallan 12Y','맥캘란 12년',5),('Ki One Tiger','기원 타이거',6),
  ('Ki One Eagle','기원 이글',7),('Ki One Unicorn','기원 유니콘',8)
) AS c(name_en, name_ko, ord);


-- ═══ Awesome Red (홍대) ═══
-- 출처: 사진 1장 (현장 촬영 보드 메뉴 — BOTTLE / COCKTAIL / SHOT / BEER / CHAMPAGNE·WINE / BEVERAGE)
-- 특이사항: 가격 만원 단위 축약("65.0" = 65,000원, "1,290.0" = 1,290,000원).
--           잔 단위(COCKTAIL / SHOT / BEER / BEVERAGE)는 규칙에 따라 제외.
--           ⚠ 돔페리뇽(DOM PERIGNON) 가격은 조명 반사로 판독 불가 → 제외함.
--           테이블차지 문구 없음 → clubs 미수정.

DELETE FROM club_menu_items WHERE club_id = '11188a87-0d52-4de0-84e3-2ae54bc6f34b';

WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur',   'Jägermeister',              '예거마이스터',        65000,  1),
  ('tequila',   'Jose Cuervo Reposado',      '호세쿠엘보 레포사도',  69000,  2),
  ('tequila',   'Jose Cuervo Silver',        '호세쿠엘보 실버',      75000,  3),
  ('gin',       'Bombay Sapphire',           '봄베이 사파이어',      75000,  4),
  ('gin',       'Bombay Bramble',            '봄베이 브램블',        75000,  5),
  ('rum',       'Bacardi Mojito (RTS)',      '바카디 모히토 (RTS)',  79000,  6),
  ('liqueur',   'Kwai Feh',                  '콰이페',              89000,  7),
  ('liqueur',   'Peachtree',                 '피치트리',            79000,  8),
  ('liqueur',   'Limonce',                   '리몬첼',              75000,  9),
  ('liqueur',   'Malibu',                    '말리부',              79000, 10),
  ('whisky',    'Jameson',                   '제임슨',              89000, 11),
  ('whisky',    'Jack Daniel''s',            '잭다니엘',            89000, 12),
  ('whisky',    'Jack Daniel''s Honey',      '잭다니엘 허니',        99000, 13),
  ('vodka',     'Smirnoff Green Apple',      '스미노프 그린애플',     79000, 14),
  ('liqueur',   'Agwa',                      '아그와',             109000, 15),
  ('liqueur',   'X-Rated',                   '엑스레이티드',         69000, 16),
  ('liqueur',   'Hpnotiq',                   '히프노틱',           129000, 17),
  ('tequila',   'Patrón Silver',             '페트론 실버 데킬라',   240000, 18),
  ('vodka',     'Skyy Vodka',                '스카이 보드카',        69000, 19),
  ('vodka',     'Skyy Flavor',               '스카이 플레이버',      75000, 20),
  ('cognac',    'Hennessy V.S.O.P',          '헤네시 V.S.O.P',     169000, 21),
  ('whisky',    'Johnnie Walker Black',      '조니워커 블랙',       159000, 22),
  ('whisky',    'Johnnie Walker Blue',       '조니워커 블루',       650000, 23),
  ('whisky',    'Macallan 17Y',              '맥캘란 17년',        490000, 24),
  ('champagne', 'Don Luciano',               '돈루치아노',           59000, 30),
  ('champagne', 'M Rose',                    '엠 로제',             59000, 31),
  ('champagne', 'Devils Brut',               '데블스브뤼 루미너스',   99000, 32),
  ('champagne', 'Luc Belaire',               '룩 벨레어',          109000, 33),
  ('champagne', 'Mumm',                      '멈',                129000, 34),
  ('champagne', 'Moët & Chandon',            '모엣샹동',           179000, 35),
  ('champagne', 'Armand de Brignac',         '아르망 드 브리냑',   1290000, 36)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '11188a87-0d52-4de0-84e3-2ae54bc6f34b', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ══════════════════════════════════════════════════════════════════
-- NightFlow — 클럽 주류 메뉴 INSERT (group2)
-- 생성일: 2026-09-05
-- ══════════════════════════════════════════════════════════════════


-- ═══ Hilo (강남) ═══
-- 출처: 사진 7장 (1~2 칵테일, 3 논알콜/글래스와인/티, 4~6 싱글몰트·버번·데킬라, 7 와인/샴페인)
-- 특이사항: 위스키 바 형태. 병(Bottle) / 하프보틀(Half Bottle) 2가지 용량 → variant로 처리.
--           잔(Glass) 가격은 규칙 1에 따라 전량 제외. 칵테일/논알콜/글래스와인/맥주/티도 제외.
--           메뉴판 원문의 'IRELAND' 섹션에 Highland Park(스코틀랜드)가 실려 있으나 원문 표기 그대로 zone 유지.
--           테이블 차지 문구 없음 → clubs 미변경.

DELETE FROM club_menu_items WHERE club_id = '19fb6d10-6e57-44ce-b82d-62ca8129bb4a';

-- Hilo: 1병만 있는 항목 (싱글몰트 / 버번 / 데킬라 / 와인 / 샴페인)
WITH src(category, name_en, name_ko, zone, price, ord) AS (VALUES
  ('whisky',    'Balvenie 12Y Doublewood',   '발베니 12년 더블우드',       'SINGLE MALT / SPEYSIDE',  290000, 1),
  ('whisky',    'Balvenie 16Y French Oak',   '발베니 16년 프렌치 오크',    'SINGLE MALT / SPEYSIDE',  680000, 2),
  ('whisky',    'The Glenlivet 12Y',         '더 글렌리벳 12년',           'SINGLE MALT / SPEYSIDE',  280000, 3),
  ('whisky',    'Glenfiddich 15Y',           '글렌피딕 15년',              'SINGLE MALT / SPEYSIDE',  350000, 5),
  ('whisky',    'Glenfiddich 18Y',           '글렌피딕 18년',              'SINGLE MALT / SPEYSIDE',  570000, 6),
  ('whisky',    'Macallan 12Y Sherry Oak',   '맥캘란 12년 셰리 오크',      'SINGLE MALT / SPEYSIDE',  320000, 7),
  ('whisky',    'GlenAllachie 12Y',          '글렌알라키 12년',            'SINGLE MALT / SPEYSIDE',  340000, 8),
  ('whisky',    'Glenmorangie The Nectar 16Y','글렌모렌지 넥타 16년',      'SINGLE MALT / HIGHLAND',  390000, 10),
  ('whisky',    'Glenmorangie Signet',       '글렌모렌지 시그넷',          'SINGLE MALT / HIGHLAND',  810000, 11),
  ('whisky',    'Dalmore 12Y',               '달모어 12년',                'SINGLE MALT / HIGHLAND',  350000, 12),
  ('whisky',    'Glendronach 12Y',           '글렌드로낙 12년',            'SINGLE MALT / HIGHLAND',  280000, 14),
  ('whisky',    'Highland Park 12Y',         '하이랜드 파크 12년',         'SINGLE MALT / IRELAND',   260000, 16),
  ('whisky',    'Laphroaig 10Y',             '라프로익 10년',              'SINGLE MALT / ISLAY',     240000, 18),
  ('whisky',    'Ardbeg Ten',                '아드벡 텐',                  'SINGLE MALT / ISLAY',     290000, 19),
  ('whisky',    'Ardbeg Uigeadail',          '아드벡 우가달',              'SINGLE MALT / ISLAY',     420000, 20),
  ('whisky',    'Lagavulin 16Y',             '라가불린 16년',              'SINGLE MALT / ISLAY',     460000, 21),
  ('whisky',    'Bowmore 15Y',               '보모어 15년',                'SINGLE MALT / ISLAY',     380000, 22),
  ('whisky',    'Aberlour A''bunadh',        '아벨라워 아부나흐',          'SINGLE MALT / C.S',       540000, 23),
  ('whisky',    'Kavalan Solist Vinho Barrique','카발란 솔리스트 비노 바리크','SINGLE MALT / ASIA',    880000, 24),
  ('whisky',    'Yamazaki 12Y',              '야마자키 12년',              'SINGLE MALT / ASIA',      660000, 25),
  ('whisky',    'Nikka Miyagikyo',           '닛카 미야기쿄',              'SINGLE MALT / ASIA',      290000, 26),
  ('whisky',    'Nikka Yoichi',              '닛카 요이치',                'SINGLE MALT / ASIA',      290000, 27),
  ('whisky',    'Elijah Craig Small Batch',  '엘리야 크레이그 스몰 배치',  'BOURBON',                 230000, 28),
  ('whisky',    'Redwood Empire (Pipe Dream)','레드우드 엠파이어 (파이프 드림)','BOURBON',            330000, 29),
  ('whisky',    'Woodford Reserve ''Double Oaked''','우드포드 리저브 더블 오크','BOURBON',            340000, 30),
  ('whisky',    'Redemption Straight Bourbon - Cognac Cask Finish Batch 2','리뎀션 스트레이트 버번 - 코냑 캐스크 피니시 배치 2','BOURBON', 460000, 31),
  ('tequila',   '1800 Cristalino',           '1800 크리스탈리노',          'TEQUILA',                 310000, 32),
  ('tequila',   '818 Reposado',              '818 레포사도',               'TEQUILA',                 380000, 33),
  ('tequila',   '818 Anejo',                 '818 아녜호',                 'TEQUILA',                 550000, 34),
  ('tequila',   'Don Julio Blanco',          '돈 훌리오 블랑코',           'TEQUILA',                 270000, 35),
  ('tequila',   'Don Julio 1942',            '돈 훌리오 1942',             'TEQUILA',                 780000, 36),
  ('tequila',   'Clase Azul Reposado',       '클라세 아줄 레포사도',       'TEQUILA',                 820000, 37),
  ('tequila',   'Jose Cuervo Reserva De La Familia','호세 쿠엘보 레세르바 데 라 파밀리아','TEQUILA', 1000000, 38),
  ('wine'    ,   'Veramonte Ritual',          '베라몬테 리추얼',            'WHITE WINE',              120000, 39),
  ('wine'    ,   'Domaine Thibert Macon-Fuisse','도멘 티베르 마콩-퓌세',    'WHITE WINE',              170000, 40),
  ('wine'    ,   'Far Niente Post & Beam',    '파 니엔테 포스트 앤 빔',     'WHITE WINE',              220000, 41),
  ('wine'    ,   'Jim Barry The Lodge Hill Shiraz','짐 배리 더 롯지 힐 쉬라즈','RED WINE',             120000, 42),
  ('wine'    ,   'Bel Colle Barolo DOCG',     '벨 콜레 바롤로 DOCG',        'RED WINE',                170000, 43),
  ('wine'    ,   'The Hilt Estate Pinot Noir','더 힐트 에스테이트 피노 누아','RED WINE',               220000, 44),
  ('champagne', 'Piper-Heidsieck Cuvee Brut','파이퍼 하이직 퀴베 브뤼',    'CHAMPAGNE',               190000, 45),
  ('champagne', 'Perrier-Jouet Grand Brut',  '페리에 주에 그랑 브뤼',      'CHAMPAGNE',               210000, 46),
  ('champagne', 'Henri Giraud Esprit Nature Brut','앙리 지로 에스프리 나뛰르 브뤼','CHAMPAGNE',       250000, 47),
  ('champagne', 'Dom Perignon 2015',         '돔 페리뇽 2015',             'CHAMPAGNE',               650000, 48)
),
ins AS (
  -- zone은 "층마다 가격표가 다른 클럽"용 축이라 메뉴판 섹션명(BOURBON/TEQUILA 등)을
  -- 넣으면 안 된다 — 넣으면 손님 화면에 엉뚱한 "층 선택" 단계가 뜬다. src의 섹션명은
  -- 사람이 대조하기 쉬우라고 남겨두고 저장은 하지 않는다.
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '19fb6d10-6e57-44ce-b82d-62ca8129bb4a', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Hilo: 병 + 하프보틀 2가지 용량이 있는 항목
WITH src(name_en, name_ko, zone, p_bottle, p_half, ord) AS (VALUES
  ('The Glenlivet 15Y', '더 글렌리벳 15년',  'SINGLE MALT / SPEYSIDE', 390000, 210000, 4),
  ('GlenAllachie 15Y',  '글렌알라키 15년',   'SINGLE MALT / SPEYSIDE', 540000, 280000, 9),
  ('Dalmore 15Y',       '달모어 15년',       'SINGLE MALT / HIGHLAND', 590000, 310000, 13),
  ('Glendronach 15Y',   '글렌드로낙 15년',   'SINGLE MALT / HIGHLAND', 410000, 220000, 15),
  ('Highland Park 15Y', '하이랜드 파크 15년','SINGLE MALT / IRELAND',  440000, 230000, 17)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '19fb6d10-6e57-44ce-b82d-62ca8129bb4a', 'whisky', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle', '1병', src.p_bottle, 1),
  ('Half bottle', '하프 보틀', src.p_half, 2)
) AS v(label_en, label_ko, price, ord);


-- ═══ Core Seoul (강남) ═══
-- 출처: 사진 4장 (1 단품 가격표+웰컴세트, 2~3 샴페인 1/2/5병, 4 세트메뉴)
-- 특이사항: 샴페인 전 품목 1병/2병/5병 병수 세트 → variant.
--           테이블차지 50,000원 (평일/주말 구분 없음) → clubs 업데이트.
--           WELCOME SET / SET MENU 는 category='set'.
--           SET 1은 "룩벨레어 로제 or 럭스 7B" 선택 → choices 처리.
--           원가 취소선(2,300,000 등)은 저장하지 않고 실판매가만 기록.

UPDATE clubs SET table_charge_weekday = 50000, table_charge_weekend = 50000
WHERE id = 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4';

DELETE FROM club_menu_items WHERE club_id = 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4';

-- Core Seoul: 단품 (1병)
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Tina',              '티나',           250000, 1),
  ('liqueur', 'Malibu',            '말리부',         250000, 2),
  ('liqueur', 'Cocalero',          '코카레로',       250000, 3),
  ('whisky',  'Jameson',           '제임슨',         250000, 4),
  ('whisky',  'Ballantine''s 17Y', '발렌타인 17년',  450000, 5),
  ('whisky',  'Ballantine''s 21Y', '발렌타인 21년',  800000, 6),
  ('whisky',  'Johnnie Walker Blue Label', '조니워커 블루라벨', 1200000, 7),
  ('tequila', 'Sierra Reposado',   '시에라 레포사도', 250000, 8),
  ('tequila', 'Olmeca Altos',      '올메카 알토스',  300000, 9),
  ('tequila', 'Clase Azul',        '클라세 아줄',    1200000, 10),
  ('vodka',   'Absolut',           '앱솔루트',       250000, 11),
  ('vodka',   'Belvedere',         '벨베디어',       300000, 12)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Core Seoul: 샴페인 1병/2병/5병
WITH src(name_en, name_ko, p1, p2, p5, ord) AS (VALUES
  ('Jean Pierre',                '장 피에르',          250000,  500000, 1200000, 20),
  ('Trixon Brut',                '트릭슨 브뤼',        250000,  500000, 1200000, 21),
  ('Luc Belaire Rose',           '룩벨레어 로제',      300000,  550000, 1300000, 22),
  ('Luc Belaire Luxe',           '룩벨레어 럭스',      300000,  550000, 1300000, 23),
  ('G.H. Mumm',                  '지에이치 멈',        350000,  600000, 1400000, 24),
  ('Moet N.I.R',                 '모엣 니르',          500000,  900000, 2200000, 25),
  ('Perrier-Jouet Belle Epoque', '페리에주에 벨 에포크(루미너스)', 1200000, 2100000, 5000000, 26),
  ('Dom Perignon',               '돔페리뇽 루미너스',  1400000, 2600000, 6000000, 27),
  ('Armand de Brignac',          '아르망 드 브리냑',   2200000, 4200000, 10000000, 28)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('2 bottle set','2병',src.p2,2),('5 bottle set','5병',src.p5,3)
) AS v(label_en, label_ko, price, ord);

-- Core Seoul: 웰컴 세트 (앱솔루트 → 말리부 or 제임슨 변경 가능)
WITH src(name_en, name_ko, description, condition_note, price, ord) AS (VALUES
  ('Welcome Set - 2 Bottle', '웰컴세트 2병', 'Jean Pierre 1B + Absolut 1B / 장 피에르 + 앱솔루트',
   '앱솔루트는 말리부 또는 제임슨으로 변경 가능', 450000, 40),
  ('Welcome Set - 3 Bottle', '웰컴세트 3병', 'Luc Belaire Rose 1B + Absolut 2B / 룩벨 로제 + 앱솔루트 2B',
   '앱솔루트는 말리부 또는 제임슨으로 변경 가능', 650000, 41)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4', 'set', name_en, name_ko, description, condition_note, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Core Seoul: SET MENU 1~4
WITH src(name_en, name_ko, description, condition_note, price, ord) AS (VALUES
  ('SET 1', '세트 1', 'Luc Belaire Rose 7B or Luc Belaire Luxe 7B + Olmeca Altos 1B / 룩벨레어 로제 or 럭스 7B + 올메카 알토스 1B',
   '룩벨레어 럭스는 로제로 변경 가능', 2000000, 50),
  ('SET 2', '세트 2', 'Perrier Jouet Belle Epoque 2B + Luc Belaire Luxe 4B + Olmeca Altos 1B / 페리에주에 루미너스 2B + 룩벨레어 럭스 6B + 올메카알토스 1B',
   '룩벨레어 럭스는 로제로 변경 가능', 3000000, 51),
  ('SET 3', '세트 3', 'Clase Azul 1B + Perrier Jouet Belle Epoque 2B + Luc Belaire Luxe 4B / 클라세 아줄 1B + 페리에주에 루미너스 2B + 룩벨레어 럭스 4B',
   '룩벨레어 럭스는 로제로 변경 가능', 4000000, 52),
  ('SET 4', '세트 4', 'Armand de Brignac 1B + Perrier Jouet Belle Epoque 2B + Luc Belaire Luxe 5B / 아르망 드 브리냑 1B + 페리에주에 루미너스 2B + 룩벨레어 럭스 5B',
   '룩벨레어 럭스는 로제로 변경 가능', 5000000, 53)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4', 'set', name_en, name_ko, description, condition_note, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Core Seoul: SET 1 선택 슬롯 (샴페인 7병 종류 택1)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Luc Belaire Rose x7', '룩벨레어 로제 7병', 1),
  ('Luc Belaire Luxe x7', '룩벨레어 럭스 7병', 2)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4' AND i.name_en = 'SET 1';

-- Core Seoul: 웰컴세트 하드 변경 선택지
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Absolut',  '앱솔루트', 1),
  ('Malibu',   '말리부',   2),
  ('Jameson',  '제임슨',   3)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4'
  AND i.name_en IN ('Welcome Set - 2 Bottle', 'Welcome Set - 3 Bottle');


-- ═══ SOLE (이태원) ═══
-- 출처: 사진 4장 (1 세트메뉴, 2 샴페인 세트메뉴, 3 하드리커, 4 위스키/샴페인)
-- 특이사항: 2병/3병 세트에 "CHOOSE 1" 선택형 → club_menu_choices.
--           모든 가격 부가세 포함. 테이블 차지 문구 없음 → clubs 미변경.
--           Malibu는 RUM과 LIQUEUR 양쪽에 동일가(170,000)로 중복 게재되어 rum으로 1회만 등록.

DELETE FROM club_menu_items WHERE club_id = '7174ef04-69b4-41c2-a127-e205889da72f';

-- SOLE: 단품 병 메뉴
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',     'Skyy Vodka',            '스카이 보드카',      140000, 1),
  ('vodka',     'Absolut Vodka',         '앱솔루트 보드카',    140000, 2),
  ('vodka',     'Grey Goose',            '그레이 구스 보드카', 270000, 3),
  ('tequila',   'Jose Cuervo',           '호세 쿠엘보',        200000, 4),
  ('tequila',   'Patron Silver',         '패트론 실버',        360000, 5),
  ('tequila',   '818 Reposado',          '818 레포사도',       360000, 6),
  ('tequila',   '818 Anejo',             '818 아녜호',         500000, 7),
  ('rum',       'Malibu',                '말리부',             170000, 8),
  ('rum',       'Waikiki',               '와이키키',           170000, 9),
  ('gin',       'Bombay Sapphire',       '봄베이 사파이어',    200000, 10),
  ('gin',       'Hendrick''s Gin',       '핸드릭스 진',        250000, 11),
  ('liqueur',   'Jagermeister',          '예거마이스터',       200000, 12),
  ('liqueur',   'Jagermeister Orange',   '예거마이스터 오렌지',200000, 13),
  ('liqueur',   'Fireball',              '파이어볼',           200000, 14),
  ('liqueur',   'Agwa',                  '아구아',             200000, 15),
  ('liqueur',   'X-Rated',               '엑스 레이티드',      210000, 16),
  ('whisky',    'Jameson',               '제임슨',             190000, 20),
  ('whisky',    'Jim Beam',              '짐빔',               190000, 21),
  ('whisky',    'Jack Daniel''s',        '잭다니엘스',         200000, 22),
  ('whisky',    'Monkey Shoulder',       '몽키숄더',           270000, 23),
  ('whisky',    'Balvenie 12Y',          '발베니 12년',        300000, 24),
  ('cognac',    'Hennessy VSOP',         '헤네시 VSOP',        350000, 25),
  ('whisky',    'Glenfiddich 12Y',       '글렌피딕 12년',      300000, 26),
  ('whisky',    'Glenfiddich 15Y',       '글렌피딕 15년',      350000, 27),
  ('whisky',    'Macallan 12Y',          '맥캘란 12년',        300000, 28),
  ('whisky',    'Macallan 15Y',          '맥캘란 15년',        500000, 29),
  ('whisky',    'Macallan 18Y',          '맥캘란 18년',        1800000, 30),
  ('champagne', 'Louis Perdrier',        '루이 페드리에',       69000, 40),
  ('champagne', 'Moet & Chandon',        '모엣 샹동',          250000, 41),
  ('champagne', 'Veuve Clicquot',        '뵈브 클리코',        270000, 42),
  ('champagne', 'Dom Perignon',          '돔 페리뇽',          850000, 43),
  ('champagne', 'Armand de Brignac',     '아르망 드 브리냑',   2000000, 44)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '7174ef04-69b4-41c2-a127-e205889da72f', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- SOLE: 세트 메뉴
WITH src(name_en, name_ko, description, condition_note, price, ord) AS (VALUES
  ('2 Bottle Set - Skyy + Louis Perdrier', '2병 세트 - 스카이 + 루이 페드리에',
   'Skyy Vodka 1B + Louis Perdrier 1B', NULL, 179000, 50),
  ('2 Bottle Set - Skyy + Choose 1', '2병 세트 - 스카이 + 택1',
   'Skyy Vodka 1B + Choose 1 (Jose Cuervo / Jagermeister Orange / Agwa / Fireball / X-Rated / Waikiki(Malibu))',
   '6종 중 1병 선택', 279000, 51),
  ('3 Bottle Set - Skyy + Louis Perdrier + Choose 1', '3병 세트 - 스카이 + 루이 페드리에 + 택1',
   'Skyy Vodka 1B + Louis Perdrier 1B + Choose 1 (Jose Cuervo / Jagermeister Orange / Agwa / Fireball / X-Rated / Jack Daniel''s / Waikiki(Malibu) / Buffalo Trace)',
   '8종 중 1병 선택', 399000, 52),
  ('Champagne Set - 2 Moet + 2 Louis Perdrier', '샴페인 세트 - 모엣 2 + 루이 페드리에 2',
   '2 Moet Chandon + 2 Louis Perdrier', NULL, 499000, 53),
  ('Champagne Set - 2 Veuve + 2 Louis Perdrier', '샴페인 세트 - 뵈브 2 + 루이 페드리에 2',
   '2 Veuve Clicquot + 2 Louis Perdrier', NULL, 699000, 54),
  ('Champagne Set - Dom Perignon + 4 Moet', '샴페인 세트 - 돔페리뇽 + 모엣 4',
   'Dom Perignon 1B + 4 Moet Chandon', NULL, 1750000, 55),
  ('Champagne Set - 3 Dom Perignon', '샴페인 세트 - 돔페리뇽 3',
   '3 Dom Perignon', NULL, 2390000, 56),
  ('Champagne Set - Armand de Brignac + 2 Dom Perignon', '샴페인 세트 - 아르망 + 돔페리뇽 2',
   'Armand de Brignac 1B + 2 Dom Perignon', NULL, 3590000, 57)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT '7174ef04-69b4-41c2-a127-e205889da72f', 'set', name_en, name_ko, description, condition_note, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- SOLE: 2병 세트 CHOOSE 1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Jose Cuervo',         '호세 쿠엘보',         1),
  ('Jagermeister Orange', '예거마이스터 오렌지', 2),
  ('Agwa',                '아구아',              3),
  ('Fireball',            '파이어볼',            4),
  ('X-Rated',             '엑스 레이티드',       5),
  ('Waikiki (Malibu)',    '와이키키(말리부)',    6)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = '7174ef04-69b4-41c2-a127-e205889da72f'
  AND i.name_en = '2 Bottle Set - Skyy + Choose 1';

-- SOLE: 3병 세트 CHOOSE 1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Jose Cuervo',         '호세 쿠엘보',         1),
  ('Jagermeister Orange', '예거마이스터 오렌지', 2),
  ('Agwa',                '아구아',              3),
  ('Fireball',            '파이어볼',            4),
  ('X-Rated',             '엑스 레이티드',       5),
  ('Jack Daniel''s',      '잭다니엘스',          6),
  ('Waikiki (Malibu)',    '와이키키(말리부)',    7),
  ('Buffalo Trace',       '버팔로 트레이스',     8)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = '7174ef04-69b4-41c2-a127-e205889da72f'
  AND i.name_en = '3 Bottle Set - Skyy + Louis Perdrier + Choose 1';


-- ═══ 아르쥬 청담 라운지 (강남) ═══
-- 출처: 사진 1장
-- 특이사항: ⚠️ 병 단위 주류 메뉴 없음 — 제공된 사진은 잔 단위 칵테일/맥주/소다/카페/
--           안주(애피타이저·파스타·메인·디저트) 메뉴판 뒷면으로 보임.
--           규칙 1(잔 단위 제외)에 따라 INSERT 대상 없음. 병 메뉴판 사진 추가 확보 필요.
-- (INSERT 없음)


-- ═══ Waikiki (대전) ═══
-- 출처: 사진 1장
-- 특이사항: NORMAL / HARD / WHISKY & COGNAC / CHAMPAGNE 4개 섹션.
--           "Booth + 30,000원 (음료포함)" 문구는 부스 업그레이드 비용으로,
--           일반 테이블 차지 표기가 아니므로 clubs.table_charge_* 는 건드리지 않고
--           condition_note 로도 개별 항목에 붙이지 않음(전 품목 공통 안내).
--           메뉴판에 계좌번호(카카오뱅크)가 있으나 저장 대상 아님.

DELETE FROM club_menu_items WHERE club_id = '2da95598-f1e1-4090-b76d-381484d263fe';

WITH src(category, name_en, name_ko, zone, price, ord) AS (VALUES
  ('liqueur',   'Peachtree',        '피치트리',       'NORMAL BOTTLE', 120000, 1),
  ('rum',       'Malibu',           '말리부',         'NORMAL BOTTLE', 120000, 2),
  ('vodka',     'Skyy Vodka',       '스카이 보드카',  'NORMAL BOTTLE', 120000, 3),
  ('vodka',     'Skyy Vodka Peach', '스카이 피치',    'NORMAL BOTTLE', 120000, 4),
  ('tequila',   'Jose Cuervo Margarita', '호세쿠엘보 마가리타', 'NORMAL BOTTLE', 120000, 5),
  ('tequila',   'Jose Cuervo',      '호세쿠엘보',     'NORMAL BOTTLE', 130000, 6),
  ('liqueur',   'Jagermeister',     '예거마이스터',   'NORMAL BOTTLE', 130000, 7),
  ('liqueur',   'Cocalero',         '코카레로',       'NORMAL BOTTLE', 130000, 8),
  ('liqueur',   'Agwa',             '아구와',         'HARD BOTTLE',   150000, 10),
  ('liqueur',   'X-Rated',          '엑스레이티드',   'HARD BOTTLE',   170000, 11),
  ('liqueur',   'Hpnotiq',          '힙노틱',         'HARD BOTTLE',   170000, 12),
  ('whisky',    'Golden Blue',      '골든블루',       'WHISKY & COGNAC', 130000, 20),
  ('whisky',    'Jameson',          '제임슨',         'WHISKY & COGNAC', 130000, 21),
  ('whisky',    'Jack Daniel''s',   '잭다니엘',       'WHISKY & COGNAC', 140000, 22),
  ('whisky',    'Jack Daniel''s Apple', '잭다니엘 애플', 'WHISKY & COGNAC', 140000, 23),
  ('whisky',    'Jack Daniel''s Honey', '잭다니엘 허니', 'WHISKY & COGNAC', 140000, 24),
  ('cognac',    'Hennessy VSOP',    '헤네시 VSOP',    'WHISKY & COGNAC', 350000, 25),
  ('champagne', 'Ginjaro',          '진자로',         'CHAMPAGNE',       80000, 30),
  ('champagne', 'Diablo',           '디아블로',       'CHAMPAGNE',      150000, 31),
  ('champagne', 'Bemini Luminous',  '비니니 루미너스','CHAMPAGNE',      150000, 32),
  ('champagne', 'Luc Belaire Gold', '룩벨골드',       'CHAMPAGNE',      200000, 33),
  ('champagne', 'Luc Belaire Rose', '룩벨로제',       'CHAMPAGNE',      230000, 34),
  ('champagne', 'Luc Belaire Luxe', '룩벨럭스',       'CHAMPAGNE',      250000, 35),
  ('champagne', 'Moet & Chandon',   '모엣임페리얼',   'CHAMPAGNE',      250000, 36),
  ('champagne', 'Moet N.I.R',       '모엣 NIR',       'CHAMPAGNE',      300000, 37),
  ('champagne', 'Dom Perignon Luminous', '돔페리뇽 루미너스', 'CHAMPAGNE', 1000000, 38),
  ('champagne', 'Armand de Brignac','아르망디',       'CHAMPAGNE',     1800000, 39)
),
ins AS (
  -- zone은 층별 가격표가 다른 클럽용 축이다. 여기 값은 메뉴판 섹션명이라
  -- 저장하지 않는다(저장하면 손님 화면에 엉뚱한 "층 선택"이 뜬다).
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '2da95598-f1e1-4090-b76d-381484d263fe', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ Gathering (이태원) ═══
-- 출처: 사진 1장 (확대 크롭 4회로 판독)
-- 특이사항: "BUY IT, FREE PASS NO LINE / 바틀 주문 시 프리패스 & 무료입장" → 세트 항목 condition_note.
--           2병/3병 세트에 CHOOSE 1 선택형 → club_menu_choices.
--           모든 가격 부가세 포함. 테이블 차지 문구 없음 → clubs 미변경.

DELETE FROM club_menu_items WHERE club_id = 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6';

-- Gathering: 단품 병 메뉴
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',     'Absolut Vodka',       '앱솔루트 보드카',    170000, 1),
  ('vodka',     'Grey Goose',          '그레이 구스 보드카', 270000, 2),
  ('tequila',   'Jose Cuervo',         '호세 쿠엘보',        200000, 3),
  ('tequila',   'Pepe Lopez',          '페페로페즈',         200000, 4),
  ('tequila',   'Patron Silver',       '패트론 실버',        360000, 5),
  ('tequila',   '818 Reposado',        '818 레포사도',       360000, 6),
  ('tequila',   '818 Anejo',           '818 아녜호',         500000, 7),
  ('rum',       'Malibu',              '말리부',             190000, 8),
  ('rum',       'Bacardi',             '바카디',             190000, 9),
  ('gin',       'Bombay Sapphire',     '봄베이 사파이어',    190000, 10),
  ('gin',       'Hendrick''s Gin',     '핸드릭스 진',        250000, 11),
  ('liqueur',   'Peach Tree',          '피치 트리',          190000, 12),
  ('liqueur',   'Agwa',                '아구아',             220000, 13),
  ('liqueur',   'Jagermeister',        '예거마이스터',       200000, 14),
  ('liqueur',   'Jagermeister Orange', '예거마이스터 오렌지',200000, 15),
  ('liqueur',   'Fireball',            '파이어볼',           200000, 16),
  ('liqueur',   'Hpnotiq',             '힙노틱',             210000, 17),
  ('champagne', 'Luc Belaire Rose',    '룩벨레어 로제',      250000, 20),
  ('champagne', 'Luc Belaire Luxe',    '룩벨레어 럭스',      250000, 21),
  ('champagne', 'Moet & Chandon',      '모엣',               250000, 22),
  ('champagne', 'Moet N.I.R',          '모엣 N.I.R',         350000, 23),
  ('champagne', 'Dom Perignon',        '돔 페리뇽',          900000, 24),
  ('champagne', 'Armand de Brignac',   '아르망 드 브리냑',   2500000, 25),
  ('whisky',    'Jameson',             '제임슨',             200000, 30),
  ('whisky',    'Jack Daniel''s',      '잭다니엘스',         210000, 31),
  ('whisky',    'Johnnie Walker Black','조니워커 블랙',      270000, 32),
  ('cognac',    'Hennessy VSOP',       '헤네시 VSOP',        350000, 33),
  ('whisky',    'Balvenie 12Y',        '발베니 12년',        400000, 34),
  ('whisky',    'Glenfiddich 12Y',     '글렌피딕 12년',      300000, 35),
  ('whisky',    'Glenfiddich 15Y',     '글렌피딕 15년',      370000, 36),
  ('whisky',    'Macallan 12Y',        '맥캘란 12년',        350000, 37),
  ('whisky',    'Macallan 15Y',        '맥캘란 15년',        550000, 38),
  ('whisky',    'Macallan 18Y',        '맥캘란 18년',        1800000, 39)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Gathering: 세트 메뉴
WITH src(name_en, name_ko, description, condition_note, price, ord) AS (VALUES
  ('2 Bottle Set - Absolut + 365 Brut Italia', '2병 세트 - 앱솔루트 + 365 브뤼 이탈리아',
   'Absolut Vodka 1B + 365 Brut Italia 1B',
   '바틀 주문 시 프리패스 & 무료입장 (BUY IT, FREE PASS NO LINE)', 199000, 50),
  ('2 Bottle Set - Absolut + Choose 1', '2병 세트 - 앱솔루트 + 택1',
   'Absolut Vodka 1B + Choose 1 (Malibu / Jagermeister Orange / Agwa / Fireball / Hpnotiq)',
   '바틀 주문 시 프리패스 & 무료입장 / 5종 중 1병 선택', 299000, 51),
  ('3 Bottle Set - Absolut + 365 Brut Italia + Choose 1', '3병 세트 - 앱솔루트 + 365 브뤼 이탈리아 + 택1',
   'Absolut Vodka 1B + 365 Brut Italia 1B + Choose 1 (Malibu / Jameson / Jose Cuervo / Jagermeister Orange / Agwa / Fireball / Jack Daniel''s / Hpnotiq)',
   '바틀 주문 시 프리패스 & 무료입장 / 8종 중 1병 선택', 399000, 52),
  ('Champagne Set - 2 Luc Belaire Rose + 2 365 Brut Italia', '샴페인 세트 - 룩벨레어 로제 2 + 365 브뤼 이탈리아 2',
   '2 Luc Belaire Rose + 2 365 Brut Italia',
   '바틀 주문 시 프리패스 & 무료입장', 499000, 53),
  ('Champagne Set - 2 Luc Belaire Luxe + 2 365 Brut Italia', '샴페인 세트 - 룩벨레어 럭스 2 + 365 브뤼 이탈리아 2',
   '2 Luc Belaire Luxe + 2 365 Brut Italia',
   '바틀 주문 시 프리패스 & 무료입장', 499000, 54),
  ('Champagne Set - 2 Moet Chandon + 2 365 Brut Italia', '샴페인 세트 - 모엣 샹동 2 + 365 브뤼 이탈리아 2',
   '2 Moet Chandon + 2 365 Brut Italia',
   '바틀 주문 시 프리패스 & 무료입장', 499000, 55),
  ('Champagne Set - 2 Moet N.I.R + 2 365 Brut Italia', '샴페인 세트 - 모엣 N.I.R 2 + 365 브뤼 이탈리아 2',
   '2 Moet N.I.R + 2 365 Brut Italia',
   '바틀 주문 시 프리패스 & 무료입장', 699000, 56),
  ('Champagne Set - 1 Dom Perignon + 4 Moet Chandon', '샴페인 세트 - 돔 페리뇽 1 + 모엣 샹동 4',
   '1 Dom Perignon + 4 Moet Chandon',
   '바틀 주문 시 프리패스 & 무료입장', 1750000, 57),
  ('Champagne Set - Armand + Dom Perignon + 2 365 Brut Italia', '샴페인 세트 - 아르망 + 돔 페리뇽 + 365 브뤼 이탈리아 2',
   '1 Armand de Brignac + 1 Dom Perignon + 2 365 Brut Italia',
   '바틀 주문 시 프리패스 & 무료입장', 3300000, 58)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6', 'set', name_en, name_ko, description, condition_note, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Gathering: 2병 세트 CHOOSE 1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Malibu',              '말리부',              1),
  ('Jagermeister Orange', '예거마이스터 오렌지', 2),
  ('Agwa',                '아구아',              3),
  ('Fireball',            '파이어볼',            4),
  ('Hpnotiq',             '힙노틱',              5)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6'
  AND i.name_en = '2 Bottle Set - Absolut + Choose 1';

-- Gathering: 3병 세트 CHOOSE 1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Malibu',              '말리부',              1),
  ('Jameson',             '제임슨',              2),
  ('Jose Cuervo',         '호세 쿠엘보',         3),
  ('Jagermeister Orange', '예거마이스터 오렌지', 4),
  ('Agwa',                '아구아',              5),
  ('Fireball',            '파이어볼',            6),
  ('Jack Daniel''s',      '잭다니엘스',          7),
  ('Hpnotiq',             '힙노틱',              8)
) AS c(name_en, name_ko, ord)
WHERE i.club_id = 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6'
  AND i.name_en = '3 Bottle Set - Absolut + 365 Brut Italia + Choose 1';


-- ═══ B1 (홍대) ═══
-- 출처: 사진 1장 (인스타그램 캡처, b1_hongdae)
-- 특이사항: BOTTLE / VIP BOTTLE / CHAMPAGNE 3개 섹션.
--           VIP BOTTLE 섹션 → is_vvip = TRUE (카테고리는 장르 그대로 유지).
--           테이블 차지 문구 없음 → clubs 미변경.

DELETE FROM club_menu_items WHERE club_id = '5d786696-e6b3-472b-bbe8-4923c42b0007';

-- B1: 일반 BOTTLE + CHAMPAGNE
WITH src(category, name_en, name_ko, zone, price, ord) AS (VALUES
  ('rum',       'Malibu',          '말리부',          'BOTTLE',     80000, 1),
  ('liqueur',   'Jagermeister',    '예거마이스터',    'BOTTLE',     80000, 2),
  ('tequila',   'Jose Cuervo',     '호세 쿠엘보',     'BOTTLE',     80000, 3),
  ('liqueur',   'X-Rated',         '엑스 레이티드',   'BOTTLE',     90000, 4),
  ('whisky',    'Jack Daniel''s',  '잭다니엘스',      'BOTTLE',     90000, 5),
  ('whisky',    'Jack Daniel''s Honey', '잭다니엘 허니','BOTTLE',    90000, 6),
  ('champagne', 'Louis Perdrier',  '루이 페드리에',   'CHAMPAGNE',  55000, 10),
  ('champagne', 'Golden Blanc',    '골든 블랑',       'CHAMPAGNE', 100000, 11)
),
ins AS (
  -- zone은 층별 가격표가 다른 클럽용 축이다. 여기 값은 메뉴판 섹션명이라
  -- 저장하지 않는다(저장하면 손님 화면에 엉뚱한 "층 선택"이 뜬다).
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5d786696-e6b3-472b-bbe8-4923c42b0007', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- B1: VIP BOTTLE (is_vvip)
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Hpnotiq',       '힙노틱',        100000, 20),
  ('whisky',  'Jameson',       '제임슨',        100000, 21),
  ('liqueur', 'Fireball',      '파이어볼',      100000, 22),
  ('vodka',   'Absolut',       '앱솔루트',      100000, 23),
  ('vodka',   'Grey Goose',    '그레이 구스',   140000, 24),
  ('cognac',  'Hennessy',      '헤네시',        220000, 25),
  ('tequila', 'Patron Silver', '패트론 실버',   260000, 26)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '5d786696-e6b3-472b-bbe8-4923c42b0007', category, name_en, name_ko, TRUE, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ════════════════════════════════════════════════════════════════════
-- Group 3 클럽 주류 메뉴 INSERT
-- ════════════════════════════════════════════════════════════════════


-- ═══ LOBBY 157 (강남) ═══
-- 출처: 사진 6장 (HARD BOTTLE / EARLY BIRD SET / CHAMPAGNE / BOTTLE PACKAGE / VIP TABLE SET / 157 SET)
-- 특이사항: 테이블차지 50,000원(음료·물 기본차지) / 병수 패키지(3·5병) variant / 선택형 얼리버드 세트(6종 중 택2) / VIP TABLE SET·157 SET 조합세트

DELETE FROM club_menu_items WHERE club_id = '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f';

UPDATE clubs SET table_charge_weekday = 50000, table_charge_weekend = 50000
WHERE id = '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f';

-- ── HARD BOTTLE (단품만) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Jägermeister',            '예거마이스터',      250000, 1),
  ('liqueur', 'Jägermeister Orange',     '예거마이스터 오렌지', 250000, 2),
  ('whisky',  'Jim Beam',                '짐빔',             300000, 3),
  ('liqueur', 'Mua',                     '무아',             250000, 4),
  ('liqueur', 'Malibu',                  '말리부',            250000, 5),
  ('liqueur', 'Tina [Red/Green/Lemon]',  '티나 [레드/그린/레몬]', 250000, 6),
  ('vodka',   'Absolute Vodka',          '앱솔루트 보드카',    250000, 7),
  ('vodka',   'Grey Goose',              '그레이 구스',       300000, 8),
  ('gin',     'Bombay Sapphire',         '봄베이 사파이어',    300000, 9),
  ('tequila', 'Jose Cuervo',             '호세쿠엘보',        300000, 10),
  ('tequila', 'Patron Silver',           '페트론 실버',       500000, 11),
  ('whisky',  'Balvenie 12 Year',        '발베니 12년',       450000, 12),
  ('tequila', 'Clase Azul Reposado',     '클라세 아줄 레포사도', 1200000, 13),
  ('whisky',  'Johnnie Walker Blue Label','조니워커 블루 라벨', 1200000, 15),
  ('cognac',  'Hennessy V.S.O.P',        '헤네시 VSOP',      500000, 16),
  ('cognac',  'Hennessy X.O',            '헤네시 XO',        1300000, 17)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── Clase Azul Gold (단품 + 3병/5병 패키지) ──
WITH src(name_en, name_ko, p1, p3, p5, ord) AS (VALUES
  ('Clase Azul Gold', '클라세 아줄 골드', 1800000, 3500000, 5500000, 14)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', 'tequila', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),('5 bottle set','5병',src.p5,3)
) AS v(label_en, label_ko, price, ord);

-- ── CHAMPAGNE (단품 + BOTTLE PACKAGE 3/5병) ──
WITH src(name_en, name_ko, p1, p3, p5, ord) AS (VALUES
  ('Illumi Light',              '일루미 라이트',        250000,  700000, 1200000, 20),
  ('Illumi Light Ice',          '일루미 라이트 아이스',   250000,  700000, 1200000, 21),
  ('Illumi Light Rose',         '일루미 라이트 로제',     350000, 1000000, 1650000, 22),
  ('Montelvini',                '몬텔비니',            250000,  700000, 1200000, 23),
  ('Moët & Chandon Impérial',   '모엣 샹동',           350000, 1000000, 1600000, 24),
  ('Moët & Chandon N.I.R',      '모엣 샹동 니르',       450000, 1300000, 2200000, 25),
  ('Dom Pérignon Luminous',     '돔 페리뇽 루미너스',    1400000, 4000000, 6500000, 26),
  ('Armand de Brignac Gold',    '아르망 드 브리냑 골드',  2200000, 6000000, 10000000, 27)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),('5 bottle set','5병',src.p5,3)
) AS v(label_en, label_ko, price, ord);

-- ── EARLY BIRD SET (6종 중 택2) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  VALUES ('5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', 'set',
          'Early Bird Set - Pick 2 Bottles', '얼리버드 세트 - 2병 선택',
          '6종 중 2병 선택', 30)
  RETURNING id
),
v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT id, 'Pick 2 bottles', '2병 선택', 450000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, c.slot_no, c.name_en, c.name_ko, c.ord
FROM ins CROSS JOIN (VALUES
  (1, 'Montelvini',     '몬텔비니',   1),
  (1, 'Jose Cuervo',    '호세쿠엘보',  2),
  (1, 'Tina',           '티나',      3),
  (1, 'Mua',            '무아',      4),
  (1, 'Malibu',         '말리부',     5),
  (1, 'Absolute Vodka', '앱솔루트',   6),
  (2, 'Montelvini',     '몬텔비니',   1),
  (2, 'Jose Cuervo',    '호세쿠엘보',  2),
  (2, 'Tina',           '티나',      3),
  (2, 'Mua',            '무아',      4),
  (2, 'Malibu',         '말리부',     5),
  (2, 'Absolute Vodka', '앱솔루트',   6)
) AS c(slot_no, name_en, name_ko, ord);

-- ── VIP TABLE SET (조합 세트) ──
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Clase Azul Gold 1 + Dom Pérignon Luminous 3',  '클라세 아줄 골드 1 + 돔 페리뇽 루미너스 3', 5000000, 40),
  ('Clase Azul Gold 1 + Armand de Brignac Gold 3', '클라세 아줄 골드 1 + 아르망 드 브리냑 골드 3', 7000000, 41),
  ('Clase Azul Gold 1 + Moët & Chandon N.I.R 3',   '클라세 아줄 골드 1 + 모엣 샹동 니르 3', 2400000, 42),
  ('Clase Azul Gold 3 + Dom Pérignon Luminous 3',  '클라세 아줄 골드 3 + 돔 페리뇽 루미너스 3', 7000000, 43),
  ('Clase Azul Gold 3 + Armand de Brignac Gold 3', '클라세 아줄 골드 3 + 아르망 드 브리냑 골드 3', 9000000, 44)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', 'set', name_en, name_ko, TRUE, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── 157 SET ──
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Jose Cuervo 5 + Montelvini 1', '호세쿠엘보 5 + 몬텔비니 1', 1570000, 50),
  ('Dom Pérignon Luminous 10 + Clase Azul Gold 1 + Armand de Brignac Gold 1',
   '돔 페리뇽 루미너스 10 + 클라세 아줄 골드 1 + 아르망 드 브리냑 골드 1', 15700000, 51)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f', 'set', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ════════════════════════════════════════════════════════════════════

-- ═══ 브리드(BREED) (대구) ═══
-- 출처: 사진 5장 (PRIMEIER SET / STANDARD SET / EXCLUSIVE VVIP MENU / HARD / CHAMPAGNE)
-- 특이사항: 병수 세트 3B/5B/10B/11B variant / EXCLUSIVE VVIP MENU는 is_vvip=TRUE
--           Armand De Brignac Green·Demi Sec·Louis XIII Cognac은 "*가격 문의"라 가격 없음 → 제외
--           테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = '5cf5658b-b1ba-4744-a1d0-ae4a60a67828';

-- ── CHAMPAGNE 단품 (세트 없는 항목) ──
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Luc Belaire Rose',                '룩 벨레어 로제',        250000, 10),
  ('Moet Chandon',                    '모엣 샹동',            200000, 11),
  ('Moet Chandon Goldenlight Magnum', '모엣 샹동 골든라이트 메그넘', 700000, 12)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── Armand De Brignac 단품 (VVIP) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  VALUES ('5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'champagne',
          'Armand De Brignac', '아르망 드 브리냑', TRUE, 13)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT id, '1 bottle', '1병', 2000000, 1 FROM ins;

-- ── CHAMPAGNE + PRIMEIER SET (1병 + 3B/5B/10B/11B) ──
WITH src(name_en, name_ko, p1, p3, p5, p10, p11, ord) AS (VALUES
  ('Luc Belaire Luxe',   '룩 벨레어 럭스',  250000,  700000, 1100000, 2200000, 2400000, 1),
  ('Carbonic',           '카보닉',        300000,  700000, 1100000, 2200000, 2400000, 2),
  ('Carbonic Blue',      '카보닉 블루',    300000,  700000, 1100000, 2200000, 2400000, 3),
  ('Moet Chandon N.I.R', '모엣 샹동 니르',  300000,  900000, 1400000, 2800000, 3000000, 4)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),('5 bottle set','5병',src.p5,3),
  ('10 bottle set','10병',src.p10,4),('11 bottle set','11병',src.p11,5)
) AS v(label_en, label_ko, price, ord);

-- ── CHAMPAGNE + STANDARD SET (1병 + 3B/5B/10B/11B) ──
WITH src(name_en, name_ko, p1, p3, p5, p10, p11, ord) AS (VALUES
  ('Don Luciano',  '돈루치아', 70000,  210000,  330000,  650000,  700000, 5),
  ('Diablo',       '디아블로', 150000,  450000,  700000, 1400000, 1500000, 6),
  ('Golden Blanc', '골든 블랑', 250000,  700000, 1100000, 2200000, 2400000, 7)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),('5 bottle set','5병',src.p5,3),
  ('10 bottle set','10병',src.p10,4),('11 bottle set','11병',src.p11,5)
) AS v(label_en, label_ko, price, ord);

-- ── Angel / Dom Perignon Luminous (단품) ──
-- 주: 3B/5B 가격은 VVIP MENU(뮤직 퍼레이드·에스코트 포함) 쪽에만 있어 순수 병수 세트가 아님
--     → 아래 VVIP 세트 섹션에 별도 등록, 여기서는 1병만
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Angel',                 '엔젤',            900000, 8),
  ('Dom Perignon Luminous', '돔페리뇽 루미너스', 1100000, 9)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── HARD (단품) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Sweet Peach / Sweet Apple', '스위트 피치 / 스위트 애플', 100000, 20),
  ('liqueur', 'Balu Coco',                 '바루 코코',              100000, 21),
  ('tequila', 'Jose Cuervo',               '호세 쿠에르보',           110000, 22),
  ('tequila', 'El Jimador',                '엘히마도르',             110000, 23),
  ('liqueur', 'Jagermeister',              '예거마이스터',            110000, 24),
  ('whisky',  'Jack Daniel''s',            '잭 다니엘',              110000, 25),
  ('whisky',  'Jack Daniel''s Honey',      '잭 다니엘 허니',          110000, 26),
  ('whisky',  'Jack Daniel''s Apple',      '잭 다니엘 애플',          110000, 27),
  ('liqueur', 'X-Rated',                   '엑스레이티드',            120000, 28),
  ('liqueur', 'Agwa',                      '아구와',                120000, 29),
  ('liqueur', 'Hpnotiq',                   '힙노틱',                120000, 30),
  ('whisky',  'Johnnie Walker Blue',       '조니워커 블루',           700000, 31),
  ('tequila', 'Clase Azul Reposado',       '클라세 아줄 레포사도',      700000, 32)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── STANDARD SET A~D (조합 세트) ──
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Set A - Jose Cuervo 1B + Diablo 3B',                     '세트 A - 호세 쿠에르보 1B + 디아블로 3B',        500000, 40),
  ('Set B - Luc Belaire Luxe 1B + Don Luciano 2B + Hpnotiq 1B','세트 B - 룩 벨레어 럭스 1B + 돈루치아 2B + 힙노틱 1B', 500000, 41),
  ('Set C - Carbonic 1B + Don Luciano 3B',                   '세트 C - 카보닉 1B + 돈루치아 3B',              500000, 42),
  ('Set D - Hpnotiq 3B',                                     '세트 D - 힙노틱 3B',                        330000, 43)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'set', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── EXCLUSIVE VVIP MENU: SETTING MUSIC PARADE (REQUEST) ──
WITH src(name_en, name_ko, price, note, ord) AS (VALUES
  ('Armand De Brignac 1B + Dom Perignon 1B', '아르망 드 브리냑 1B + 돔페리뇽 1B', 3000000, 'SETTING MUSIC PARADE (REQUEST)', 50),
  ('Armand De Brignac 1B + Carbonic 5B',     '아르망 드 브리냑 1B + 카보닉 5B',   3000000, 'SETTING MUSIC PARADE (REQUEST)', 51),
  ('Dom Perignon 3B',                        '돔페리뇽 3B',                   3000000, 'SETTING MUSIC PARADE (REQUEST)', 52),
  ('Angel 3B + Carbonic 2B',                 '엔젤 3B + 카보닉 2B',            3000000, 'SETTING MUSIC PARADE (REQUEST)', 53),
  ('Angel 5B',                               '엔젤 5B',                      4500000, 'SETTING MUSIC PARADE + VVIP ESCORT', 54),
  ('Dom Perignon 5B',                        '돔페리뇽 5B',                   5000000, 'SETTING MUSIC PARADE + VVIP ESCORT', 55),
  ('Armand De Brignac 3B',                   '아르망 드 브리냑 3B',            5500000, 'SETTING MUSIC PARADE + VVIP ESCORT', 56)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, is_vvip, sort_order)
  SELECT '5cf5658b-b1ba-4744-a1d0-ae4a60a67828', 'set', name_en, name_ko, note, TRUE, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ════════════════════════════════════════════════════════════════════

-- ═══ SX (이태원) ═══
-- 출처: 사진 3장 (CLASSIC COCKTAILS / TEQUILA·WHISKY·GIN·CHAMPAGNE·BEER / SINGLE MALT SCOTCH WHISKY)
-- 특이사항: 사진1(칵테일)·사진3(싱글몰트 1oz 잔 단위)은 잔 단위라 전량 제외
--           사진2에서도 Tequila Shot / Bunch of Tequila / Stella Artois / Coke·Redbull 은 잔·병맥주라 제외
--           condition_note: 킵술 오픈 시 인당 10,000원 / 잔 파손 시 10,000원 브로큰 차지 (테이블차지 아님 → clubs 미변경)

DELETE FROM club_menu_items WHERE club_id = 'e06d15fc-e59a-469a-8563-a0b56ac220b4';

WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('tequila',   'Don Julio Reposado',   '돈 훌리오 레포사도',    310000, 1),
  ('tequila',   'Clase Azul Reposado',  '클라세 아줄 레포사도',   680000, 2),
  ('whisky',    'Balvenie 12Y',         '발베니 12년',         350000, 3),
  ('cognac',    'Hennessy VSOP',        '헤네시 VSOP',        250000, 4),
  ('gin',       'Hendrick''s Gin',      '헨드릭스 진',         220000, 5),
  ('champagne', 'Moet & Chandon',       '모엣 샹동',           150000, 6),
  ('champagne', 'Krug',                 '크루그',             490000, 7)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT 'e06d15fc-e59a-469a-8563-a0b56ac220b4', category, name_en, name_ko,
         '킵술 오픈 시 인당 10,000원의 비용이 발생합니다. / SX에서 사용하는 모든 잔은 이용 중 파손 시 10,000원의 브로큰 차지가 발생합니다.',
         ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ════════════════════════════════════════════════════════════════════

-- ═══ 도깨비 (홍대) ═══
-- 출처: 사진 3장 (LIQUEUR / CHAMPAGNE / CHAMPAGNE SET)
-- 특이사항: LIQUEUR는 가격 그룹별 묶음 표기(120,000 / 150,000 / 200,000)
--           CHAMPAGNE SET 시트에서 1·2·3·5·10병 variant 확보
--           사진2의 "DOM PERIGNON 1,200,000"과 사진3의 "RICHARD BABION 1 BTL 1,200,000"은
--           같은 병 이미지·같은 가격 → 동일 품목으로 통합(메뉴판 표기 불일치)
--           테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = '93f1081a-250c-402a-a0d4-9b8a309aff57';

-- ── LIQUEUR (단품) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'Mua Blue',      '무아 블루',   120000, 1),
  ('liqueur', 'Mua Red',       '무아 레드',   120000, 2),
  ('vodka',   'Absolut',       '앱솔루트',    120000, 3),
  ('liqueur', 'Uber-Meister',  '우버마이스터', 120000, 4),
  ('liqueur', 'Balu Coco',     '바루 코코',   120000, 5),
  ('tequila', 'Agavera',       '아가베라',    120000, 6),
  ('whisky',  'Fireball',      '파이어볼',    150000, 7),
  ('whisky',  'Jameson',       '제임슨',     150000, 8),
  ('liqueur', 'Agwa',          '아구와',     150000, 9),
  ('liqueur', 'X-Rated',       '엑스레이티드', 200000, 10),
  ('liqueur', 'Hpnotiq',       '힙노틱',     200000, 11),
  ('whisky',  'Jack Daniel''s','잭 다니엘',   200000, 12)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '93f1081a-250c-402a-a0d4-9b8a309aff57', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── Respeck Moscato (1/2/3/5/10병) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('93f1081a-250c-402a-a0d4-9b8a309aff57', 'champagne',
          'Respeck Moscato', '리스펙 모스카토', 20)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins CROSS JOIN (VALUES
  ('1 bottle','1병',220000,1),('2 bottle set','2병',400000,2),('3 bottle set','3병',600000,3),
  ('5 bottle set','5병',900000,4),('10 bottle set','10병',1700000,5)
) AS v(label_en, label_ko, price, ord);

-- ── CHAMPAGNE SET (1/3/5/10병) ──
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Luc Belaire Rose',   '룩 벨레어 로제',   250000,  700000, 1100000,  2100000, 21),
  ('Luc Belaire Luxe',   '룩 벨레어 럭스',   250000,  700000, 1100000,  2100000, 22),
  ('Deep Ice Luminous',  '딥 아이스 루미너스', 250000,  700000, 1100000,  2100000, 23),
  ('Moet Chandon N.I.R', '모엣 샹동 니르',   400000, 1000000, 1500000,  3000000, 24),
  ('Dom Perignon',       '돔 페리뇽',       1200000, 3400000, 5600000, 11000000, 25)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '93f1081a-250c-402a-a0d4-9b8a309aff57', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),
  ('5 bottle set','5병',src.p5,3),('10 bottle set','10병',src.p10,4)
) AS v(label_en, label_ko, price, ord);

-- ── Armand De Brignac (단품, VVIP급) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  VALUES ('93f1081a-250c-402a-a0d4-9b8a309aff57', 'champagne',
          'Armand De Brignac', '아르망 드 브리냑', TRUE, 26)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT id, '1 bottle', '1병', 2000000, 1 FROM ins;


-- ════════════════════════════════════════════════════════════════════

-- ═══ Paper (이태원) ═══
-- 출처: 사진 1장 (COCKTAIL / WHITE WINE / CHAMPAGNE / BEER / WHISKY / GIN & LIQUEUR / TEQUILA / VODKA / DRINK)
-- 특이사항: 가격이 천원 단위 축약 표기(90 = 90,000) → 전부 환산
--           "10/180" 형태는 잔/병 병기 → 병 가격(뒷 숫자)만 사용
--           Tequila "10/18/180"은 샷/잔/병 3단 → 병 가격(마지막)만 사용
--           COCKTAIL / BEER / DRINK / WHITE WINE 잔 단위(Carmen Tolten 12/90은 병 90,000 사용)은 규칙대로 처리:
--             칵테일·비어·드링크 전량 제외, 와인은 병 가격 있는 항목만 포함
--           테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'c645d2e5-0d2e-4a0f-9860-fbbc1ba89b12';

WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('champagne', 'Opera Prima Brut',           '오페라 프리마 브뤼',     90000, 1),
  ('champagne', 'Diablo Devil''s Brut',       '디아블로 데블스 브뤼',   150000, 2),
  ('champagne', 'Mumm Grand Cordon',          '멈 그랑 꼬르동',        250000, 3),
  ('champagne', 'Dom Perignon Vintage',       '돔 페리뇽 빈티지',     1000000, 4),
  ('champagne', 'Armand De Brignac',          '아르망 드 브리냑',     2200000, 5),
  ('whisky',    'Jameson',                    '제임슨',              180000, 10),
  ('whisky',    'Jack Daniel''s',             '잭 다니엘',            200000, 11),
  ('whisky',    'Johnnie Walker Black',       '조니워커 블랙',         200000, 12),
  ('whisky',    'Monkey Shoulder',            '몽키 숄더',            200000, 13),
  ('whisky',    'Glenfiddich 12y',            '글렌피딕 12년',        300000, 14),
  ('whisky',    'Balvenie Double Wood 12y',   '발베니 더블우드 12년',   350000, 15),
  ('whisky',    'Johnnie Walker Blue',        '조니워커 블루',        1000000, 16),
  ('liqueur',   'Jagermeister',               '예거마이스터',          200000, 20),
  ('gin',       'Hendricks Gin',              '헨드릭스 진',          250000, 21),
  ('liqueur',   'Limonce',                    '리몬체',              150000, 22),
  ('liqueur',   'Malibu Standard',            '말리부 스탠다드',       150000, 23),
  ('tequila',   'Sierra Reposado',            '시에라 레포사도',       180000, 30),
  ('tequila',   '1800 Anejo',                 '1800 아네호',         250000, 31),
  ('tequila',   'Patron Silver',              '페트론 실버',          350000, 32),
  ('tequila',   'Cincoro Anejo',              '싱코로 아네호',        800000, 33),
  ('vodka',     'Absolut',                    '앱솔루트',            180000, 40),
  ('vodka',     'Grey Goose',                 '그레이 구스',          250000, 41)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c645d2e5-0d2e-4a0f-9860-fbbc1ba89b12', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Paper — 화이트 와인 2종 (뒤늦게 추가)
-- 처음 읽을 때는 카테고리 목록에 wine이 없어 제외했는데, Hilo(강남)에서도 병 단위
-- 와인이 나와 Migration 645로 wine 카테고리를 추가했다. 그래서 되살린다.
-- 가격은 "12/90"(잔/병) 중 병값만 쓴다 — 잔 단위는 넣지 않는 규칙 그대로.
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Carmen Tolten', '카르멘 톨텐',  90000, 90),
  ('Invivo SJP',    '인비보 SJP',  150000, 91)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c645d2e5-0d2e-4a0f-9860-fbbc1ba89b12', 'wine', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ═══════════════════════════════════════════════════════════════════
-- GROUP 4 MENU IMPORT
-- ═══════════════════════════════════════════════════════════════════


-- ═══ Color Apgu (강남) ═══
-- 출처: 사진 5장 중 4장 사용 (5.jpg는 INTRO Museum Lounge 메뉴판 = 다른 클럽, 제외)
-- 특이사항: 선택형 세트(오트쿠티르 1 + 티나/무아/씨에라 택1·택2) / VIP SET 3종(is_vvip)
--           / 테이블차지 50,000원 (Table,Room 이용시 음료차지) / ENTRY SET은 "00:30 이전 입장 VIP 테이블 한정"

DELETE FROM club_menu_items WHERE club_id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60';

UPDATE clubs SET table_charge_weekday = 50000, table_charge_weekend = 50000
WHERE id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60';

-- 단품 (WHISKEY & COGNAC / LIQUEUR & VODKA / TEQUILA / CHAMPAGNE)
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  -- CHAMPAGNE
  ('champagne', 'Haute Couture',            '오트 쿠티르',        250000,  1),
  ('champagne', 'Carbonic Blue',            '카보닉 블루',        300000,  2),
  ('champagne', 'Moet & Chandon',           '모엣상동',           350000,  3),
  ('champagne', 'Moet & Chandon N.I.R',     '모엣샹동 니르',      450000,  4),
  ('champagne', 'Dom Perignon Luminous',    '돔페리뇽 루미너스', 1400000,  5),
  ('champagne', 'Armand de Brignac',        '아르망 디 브리냑',  2200000,  6),
  -- WHISKY & COGNAC
  ('whisky',    'Johnnie Walker Blonde',    '조니워커 블론드',    250000, 10),
  ('whisky',    'Johnnie Walker Black Ruby','조니워커 블랙 루비',  400000, 11),
  ('cognac',    'Remy Martin VSOP',         '레미마틴 VSOP',      450000, 12),
  ('whisky',    'Johnnie Walker Blue',      '조니워커 블루',     1200000, 13),
  -- LIQUEUR & VODKA & GIN
  ('liqueur',   'MUA',                      '무아',               250000, 20),
  ('liqueur',   'Tina',                     '티나',               250000, 21),
  ('liqueur',   'Peachtree',                '피치트리',           300000, 22),
  ('liqueur',   'Malibu',                   '말리부',             300000, 23),
  ('vodka',     'Stoli Vodka',              '스톨리 보드카',      250000, 24),
  ('vodka',     'Grey Goose Vodka',         '그레이구스 보드카',  350000, 25),
  ('gin',       'Bombay Sapphire Gin',      '봄베이 사파이어 진', 300000, 26),
  -- TEQUILA
  ('tequila',   'Sierra',                   '씨에라',             300000, 30),
  ('tequila',   'Jose Cuervo',              '호세쿠엘보',         350000, 31),
  ('tequila',   'Cincoro Reposado',         '싱코로 레포사도',    500000, 32),
  ('tequila',   'Cincoro Anejo',            '싱코로 아네호',      950000, 33),
  ('tequila',   'Clase Azul Reposado',      '클라세 아줄 레포사도', 1200000, 34)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '80ba0738-ffbb-4463-b97e-7e68e4c0da60', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ENTRY SET (선택형: 오트쿠티르 1 + 티나/무아/씨에라 택1 또는 택2)
WITH src(name_en, name_ko, description, cond, price, ord) AS (VALUES
  ('Entry Set - 2 Bottle Set', '엔트리 세트 - 2 보틀 세트',
   'Haute Couture 1 + Tina / MUA / Sierra choice 1',
   '00:30 이전에 입장한 VIP 테이블 고객에 한하여 주문 가능합니다. / Ordering is available only for VIP tables before 00:30.',
   450000, 40),
  ('Entry Set - 3 Bottle Set', '엔트리 세트 - 3 보틀 세트',
   'Haute Couture 1 + Tina / MUA / Sierra choice 2',
   '00:30 이전에 입장한 VIP 테이블 고객에 한하여 주문 가능합니다. / Ordering is available only for VIP tables before 00:30.',
   650000, 41)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT '80ba0738-ffbb-4463-b97e-7e68e4c0da60', 'set', name_en, name_ko, description, cond, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- 2 Bottle Set: 택1
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES ('Tina','티나',1),('MUA','무아',2),('Sierra','씨에라',3)) AS c(name_en,name_ko,ord)
WHERE i.club_id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60'
  AND i.name_en = 'Entry Set - 2 Bottle Set';

-- 3 Bottle Set: 택2 (slot 1, 2)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, s.slot_no, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES (1),(2)) AS s(slot_no)
CROSS JOIN (VALUES ('Tina','티나',1),('MUA','무아',2),('Sierra','씨에라',3)) AS c(name_en,name_ko,ord)
WHERE i.club_id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60'
  AND i.name_en = 'Entry Set - 3 Bottle Set';

-- 샴페인 3병 세트 (같은 술 x3 → item 1개 + variant)
WITH src(category, name_en, name_ko, description, price, ord) AS (VALUES
  ('champagne', 'Haute Couture Set', '오트 쿠티르 세트', 'Haute Couture x 3',                700000, 50),
  ('champagne', 'Moet Set',          '모엣 세트',        'Moet & Chandon Imperial x 3',     1000000, 51),
  ('champagne', 'Moet N.I.R Set',    '모엣 니르 세트',   'Moet & Chandon N.I.R x 3',        1300000, 52)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT '80ba0738-ffbb-4463-b97e-7e68e4c0da60', category, name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '3 bottles', '3병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- VIP SET (is_vvip, 테이블 차지 Free)
WITH src(category, name_en, name_ko, description, price, ord) AS (VALUES
  ('set', 'VIP Set 1', 'VIP 세트 1', 'Clase Azul x 1 + Moet & Chandon N.I.R x 2', 2000000, 60),
  ('set', 'VIP Set 2', 'VIP 세트 2', 'Clase Azul x 1 + Dom Perignon Luminous x 1', 2500000, 61),
  ('set', 'VIP Set 3', 'VIP 세트 3', 'Dom Perignon Luminous x 3',                  4000000, 62)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, is_vvip, sort_order)
  SELECT '80ba0738-ffbb-4463-b97e-7e68e4c0da60', category, name_en, name_ko, description,
         'VIP SET은 테이블 차지 Free입니다.', TRUE, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ Lion Super Club (강남) ═══
-- 출처: 사진 5장 (1장=단품 전체, 4장=SPECIAL SET MENU 다병 세트)
-- 특이사항: 병수 세트를 variant로 통합 (돔페리뇽 3/6/10+2/20+5, 아르망 골드 3/5+1/10+1/25+3/60,
--           페리에주에 벨에포크 12병, 로제 3/6병) / 소모스 테킬라는 1,500,000 → 1,300,000 할인가 적용
--           / 테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'd2f51061-2095-4732-a999-654a1ab98905';

-- 단품 (1병) — 세트가 별도로 존재하는 술은 아래 세트 블록에서 variant로 통합
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  -- CHAMPAGNE
  ('champagne', 'Moet-Chandon Imperial Brut',              '모엣 상동 임페리얼 브뤼',         350000,  1),
  ('champagne', 'Moet-Chandon Imperial Magnum',            '모엣 상동 임페리얼 매그넘',       650000,  2),
  ('champagne', 'Moet-Chandon N.I.R Pharrell Williams Editions', '모엣 상동 니르 퍼렐 윌리엄스 에디션', 500000, 3),
  ('champagne', 'Moet-Chandon N.I.R',                      '모엣 상동 니르',                  500000,  4),
  ('champagne', 'Veuve Clicquot Brut Yellow Label',        '빅브 클리코 옐로우 라벨',         350000,  5),
  ('champagne', 'Veuve Clicquot Brut Rose',                '빅브 클리코 로제',                400000,  6),
  ('champagne', 'Dom-Perignon Rose',                       '돔 페리뇽 로제',                 2000000,  8),
  ('champagne', 'Krug Grande Cuvee',                       '크룩 그랑 뀌베',                 1600000,  9),
  ('champagne', 'Perrier Jouet Belle Epoque Brut Rose',    '페리에 주에 벨에포크 브뤼 로제', 1900000, 11),
  ('champagne', 'Armand de Brignac Rose',                  '아르망 드 브리냑 로제',          2800000, 13),
  ('champagne', 'Armand de Brignac Demi Sec',              '아르망 드 브리냑 데미 섹',       3000000, 14),
  ('champagne', 'Armand de Brignac Brut Blanc de Noirs',   '아르망 드 브리냑 브뤼 블랑 드 누아', 7500000, 15),
  ('champagne', 'Armand de Brignac Brut Blanc de Blancs',  '아르망 드 브리냑 브뤼 블랑 드 블랑', 7500000, 16),
  ('champagne', 'Louis Roederer Cristal',                  '루이 로드레 크리스탈',           2500000, 17),
  -- WHISKEY
  ('whisky',    'The Balvenie 12 Year Old',                '발베니 12년',                     450000, 20),
  ('whisky',    'Johnnie Walker Blue',                     '조니워커 블루',                  1500000, 21),
  ('whisky',    'The Macallan 12 Year Old',                '맥켈란 12년',                     500000, 22),
  ('whisky',    'The Macallan 15 Year Old',                '맥켈란 15년',                    1000000, 23),
  ('whisky',    'The Macallan 18 Year Old',                '맥켈란 18년',                    2000000, 24),
  ('whisky',    'Dalmore 12 Years Old',                    '달모어 12년',                     500000, 25),
  ('whisky',    'Dalmore 15 Years Old',                    '달모어 15년',                    1000000, 26),
  ('whisky',    'Dalmore King Alexander III',              '달모어 킹 알렉산더 3',           2000000, 27),
  ('whisky',    'Ballantines 21 Year Old',                 '발렌타인 21년',                  1000000, 28),
  ('whisky',    'Ballantines 30 Year Old',                 '발렌타인 30년',                  4500000, 29),
  ('whisky',    'Royal Salute 21 Year Old',                '로얄살루트 21년',                1000000, 30),
  ('whisky',    'Royal Salute 30 Year Old',                '로얄살루트 30년',                4500000, 31),
  ('whisky',    'Royal Salute 62 Gun Salute',              '로얄살루트 62건',               25000000, 32),
  -- COGNAC
  ('cognac',    'Hennessy V.S.O.P',                        '헤네시 브이에솝',                 350000, 40),
  ('cognac',    'Hennessy X.O',                            '헤네시 엑스오',                  1500000, 41),
  ('cognac',    'Hennessy Paradis',                        '헤네시 파라디',                  9000000, 42),
  ('cognac',    'Hennessy Richard',                        '헤네시 리차드',                 30000000, 43),
  ('cognac',    'Louis XIII',                              '루이 13세',                     20000000, 44),
  -- VODKA
  ('vodka',     'Grey Goose Vodka',                        '그레이구스',                      350000, 50),
  ('vodka',     'Belvedere Vodka',                         '벨베디어',                        350000, 51),
  -- TEQUILA
  ('tequila',   '818 Tequila Reposado',                    '818 테킬라 레포사도',             450000, 60),
  ('tequila',   '818 Tequila Eight Reserve',               '818 테킬라 에이트 리저브',       1800000, 61),
  ('tequila',   'Don Julio Blanco',                        '돈 훌리오 블랑코',                400000, 62),
  ('tequila',   'Don Julio Reposado',                      '돈 훌리오 레포사도',              450000, 63),
  ('tequila',   'Don Julio Anejo',                         '돈 훌리오 아네호',                500000, 64),
  ('tequila',   'Don Julio 1942',                          '돈 훌리오 1942',                 1000000, 65),
  ('tequila',   'Patron XO Cafe',                          '페트론 XO카페',                   400000, 66),
  ('tequila',   'Patron Silver',                           '페트론 실버',                     450000, 67),
  ('tequila',   'SOMOS Tequila Anejo Original',            '소모스 테킬라 아네호 오리지널',  1300000, 68)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'd2f51061-2095-4732-a999-654a1ab98905', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Dom-Perignon Luminous : 1병 + SPECIAL SET (3 / 6 / 10+2 / 20+5)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('d2f51061-2095-4732-a999-654a1ab98905', 'champagne',
          'Dom-Perignon Luminous', '돔 페리뇽 루미너스', 7)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',       '1병',       1600000, 1),
  ('3 bottles',      '3병',       4500000, 2),
  ('6 bottles',      '6병',       8500000, 3),
  ('10 + 2 bottles', '10 + 2병', 15000000, 4),
  ('20 + 5 bottles', '20 + 5병', 30000000, 5)
) AS v(label_en, label_ko, price, ord);

-- Perrier Jouet Belle Epoque Brut : 1병 + 12병 세트
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('d2f51061-2095-4732-a999-654a1ab98905', 'champagne',
          'Perrier Jouet Belle Epoque Brut', '페리에 주에 벨에포크 브뤼', 10)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',    1500000, 1),
  ('7 bottles',  '7병',   10000000, 2),
  ('12 bottles', '12병',  15000000, 3)
) AS v(label_en, label_ko, price, ord);

-- Perrier Jouet Belle Epoque Brut Rose (세트 전용: 3병 / 6병)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('d2f51061-2095-4732-a999-654a1ab98905', 'champagne',
          'Perrier Jouet Belle Epoque Brut Rose Set', '페리에 주에 벨에포크 브뤼 로제 세트', 12)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('3 bottles', '3병',  5600000, 1),
  ('6 bottles', '6병', 10000000, 2)
) AS v(label_en, label_ko, price, ord);

-- Armand de Brignac Gold : 1병 + SPECIAL SET (3 / 5+1 / 10+1 / 25+3 / 60)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('d2f51061-2095-4732-a999-654a1ab98905', 'champagne',
          'Armand de Brignac Gold', '아르망 드 브리냑 골드', 12)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',       '1병',        2300000, 1),
  ('3 bottles',      '3병',        6000000, 2),
  ('5 + 1 bottles',  '5 + 1병',   11000000, 3),
  ('10 + 1 bottles', '10 + 1병',  20000000, 4),
  ('25 + 3 bottles', '25 + 3병',  50000000, 5),
  ('60 bottles',     '60병',     100000000, 6)
) AS v(label_en, label_ko, price, ord);

-- Armand de Brignac Rose / Demi sec 3병 세트 (단품은 위 블록에 있음)
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Armand de Brignac Rose 3 Bottle Set',     '아르망 드 브리냑 로제 3병 세트',     7500000, 18),
  ('Armand de Brignac Demi sec 3 Bottle Set', '아르망 드 브리냑 데미 섹 3병 세트',  8500000, 19)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'd2f51061-2095-4732-a999-654a1ab98905', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '3 bottles', '3병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ BELPOS (부산) ═══
-- 출처: 사진 4장
-- 특이사항: 1/3/5/10병 variant 구조가 뚜렷 / 메뉴판 오탈자 — 4.jpg에서 파란 병(카보닉 블루)에
--           'CARBONIC RED 250,000' 라벨이 붙어 있으나 한글은 '카보닉 블루'이고 1.jpg와 가격 일치 →
--           Carbonic Blue로 정정 반영 / 테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'c40209fe-e131-4594-b9bc-98a833da5f89';

-- Carbonic Blue (1 / 3 / 5 / 10병)
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Carbonic Blue', '카보닉 블루', 1)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   250000, 1),
  ('3 bottles',  '3병',   700000, 2),
  ('5 bottles',  '5병',  1200000, 3),
  ('10 bottles', '10병', 2300000, 4)
) AS v(label_en, label_ko, price, ord);

-- Cartes de Cour King Gold
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Cartes de Cour King Gold', '카르트 드 쿠어 킹 골드', 2)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   250000, 1),
  ('3 bottles',  '3병',   700000, 2),
  ('5 bottles',  '5병',  1200000, 3),
  ('10 bottles', '10병', 2300000, 4)
) AS v(label_en, label_ko, price, ord);

-- Cartes de Cour Queen Rose
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Cartes de Cour Queen Rose', '카르트 드 쿠어 퀸 로제', 3)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   250000, 1),
  ('3 bottles',  '3병',   700000, 2),
  ('5 bottles',  '5병',  1200000, 3),
  ('10 bottles', '10병', 2300000, 4)
) AS v(label_en, label_ko, price, ord);

-- Carbonic Red
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Carbonic Red', '카보닉 레드', 4)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   300000, 1),
  ('3 bottles',  '3병',   850000, 2),
  ('5 bottles',  '5병',  1400000, 3),
  ('10 bottles', '10병', 2700000, 4)
) AS v(label_en, label_ko, price, ord);

-- Moet & Chandon
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Moet & Chandon', '모엣 샹동', 5)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   300000, 1),
  ('3 bottles',  '3병',   850000, 2),
  ('5 bottles',  '5병',  1400000, 3),
  ('10 bottles', '10병', 2700000, 4)
) AS v(label_en, label_ko, price, ord);

-- Moet & Chandon N.I.R
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Moet & Chandon N.I.R', '모엣 N.I.R', 6)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   400000, 1),
  ('3 bottles',  '3병',  1150000, 2),
  ('5 bottles',  '5병',  1900000, 3),
  ('10 bottles', '10병', 3700000, 4)
) AS v(label_en, label_ko, price, ord);

-- Piper Heidsieck Rare
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Piper Heidsieck Rare', '파이퍼 하이직 레어', 7)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   1000000, 1),
  ('3 bottles',  '3병',   2900000, 2),
  ('5 bottles',  '5병',   4700000, 3),
  ('10 bottles', '10병',  9500000, 4)
) AS v(label_en, label_ko, price, ord);

-- Dom Perignon Luminous
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Dom Perignon Luminous', '돔 페리뇽 루미너스', 8)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   1200000, 1),
  ('3 bottles',  '3병',   3500000, 2),
  ('5 bottles',  '5병',   5600000, 3),
  ('10 bottles', '10병', 11000000, 4)
) AS v(label_en, label_ko, price, ord);

-- Armand de Brignac
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', 'Armand de Brignac', '아르망 드 브리냑', 9)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('1 bottle',   '1병',   2200000, 1),
  ('3 bottles',  '3병',   6400000, 2),
  ('5 bottles',  '5병',  10500000, 3),
  ('10 bottles', '10병', 20000000, 4)
) AS v(label_en, label_ko, price, ord);

-- 단품만 있는 샴페인 (4.jpg)
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Perrier Jouet Luminous',      '페리에 주에 루미너스',      1000000, 10),
  ('Dom Perignon Rose Luminous',  '돔 페리뇽 로제 루미너스',   1500000, 11)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c40209fe-e131-4594-b9bc-98a833da5f89', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- VODKA / TEQUILA / LIQUEUR / WHISKY / GIN (4.jpg)
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',   'Absolut Vodka / Apeach',   '앱솔루트 보드카/피치',  200000, 20),
  ('gin',     'Bombay Sapphire',          '봄베이 사파이어',       200000, 21),
  ('liqueur', 'Jagermeister Spice',       '예거 스파이스',         200000, 22),
  ('tequila', 'Jose Cuervo',              '호세 쿠엘보',           200000, 23),
  ('tequila', 'Sierra',                   '씨에라',                200000, 24),
  ('liqueur', 'Cuerpo Mojito',            '쿠엘모 모히토',         200000, 25),
  ('liqueur', 'Tina',                     '티나',                  200000, 26),
  ('liqueur', 'Agwa',                     '아그와',                250000, 27),
  ('whisky',  'Jack Daniels',             '잭 다니엘',             250000, 28),
  ('whisky',  'Jack Daniels Honey',       '잭 다니엘 허니',        250000, 29),
  ('liqueur', 'X-Rated',                  '엑스 레이티드',         250000, 30),
  ('liqueur', 'Hpnotiq',                  '힙노틱',                250000, 31),
  ('tequila', 'Patron Silver',            '페트론 실버',           400000, 32),
  ('tequila', 'Clase Azul Reposado',      '클라세 아줄 레포사도',  900000, 33),
  ('whisky',  'Johnnie Walker Blue Label','조니 워커 블루 라벨',  1000000, 34),
  ('whisky',  'Ballantines 30Y',          '발렌타인 30Y',         2000000, 35)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c40209fe-e131-4594-b9bc-98a833da5f89', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ Dawn (이태원) ═══
-- 출처: 사진 2장 (1.jpg = SET DRINKS + BEER SET + CHAMPAGNE BOTTLE SET, 2.jpg = DAWN SET + BOTTLE 단품)
-- 특이사항: 가격이 천원 단위 축약 표기 ("250,0" = 250,000) → 전부 환산 반영
--           / 두 장에 A/B/C SET 이름이 중복되나 구성·가격이 달라 별도 항목으로 분리 (Set Drinks / Dawn Set)
--           / 선택형 세트 다수 (말리부/피치트리/앱솔루트 중 택1 등) → club_menu_choices 사용
--           / 앱솔루트는 기본·자몽·페어, 티나는 딸기·청포도·멜론 중 선택 가능 (description 반영)
--           / 2바틀 이상 세트주문시 음료 세트 및 과일 세트 제공 (condition_note)
--           / 맥주 세트(코로나/버드와이저)는 병 단위 세트라 포함, BEVERAGE·SHOT류는 없음
--           / 테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631';

-- BOTTLE 단품 : CHAMPAGNE / WHISKEY / HARD LIQUOR / SPARKLING WINE (2.jpg)
WITH src(category, name_en, name_ko, description, price, ord) AS (VALUES
  -- CHAMPAGNE
  ('champagne', 'Victoire Prestige Brut',      '빅투아 프레스티지 브뤼', NULL,  220000,  1),
  ('champagne', 'Moet & Chandon Imperial',     '모엣 상동 임페리얼',     NULL,  300000,  2),
  ('champagne', 'Moet & Chandon N.I.R Rose',   '모엣 상동 니르 로제',    NULL,  300000,  3),
  ('champagne', 'Veuve Clicquot',              '뵈브 클리코',            NULL,  350000,  4),
  ('champagne', 'Mumm Olympe',                 '멈 올랑프',              NULL,  500000,  5),
  ('champagne', 'Krug',                        '크룩',                   NULL,  900000,  6),
  ('champagne', 'Dom Perignon Luminous',       '돔페리뇽 루미너스',      NULL, 1000000,  7),
  -- SPARKLING WINE
  ('champagne', 'Rapel Moscato',               '라펠 모스카토',          NULL,   80000,  8),
  -- WHISKEY
  ('whisky',    'Jack Daniel''s',              '잭다니엘',               NULL,  230000, 10),
  ('whisky',    'Jack Daniel''s Apple',        '잭다니엘 애플',          NULL,  230000, 11),
  ('whisky',    'Johnnie Walker Black',        '조니워커 블랙',          NULL,  200000, 12),
  ('whisky',    'Wild Turkey',                 '와일드터키',             NULL,  250000, 13),
  ('cognac',    'Hennessy V.S.O.P',            '헤네시 V.S.O.P',         NULL,  350000, 14),
  ('whisky',    'Balvenie Doublewood 12y',     '발베니 12년',            NULL,  400000, 15),
  ('whisky',    'Macallan Sherry Oak 12y',     '맥켈란 쉐리오크 12년',   NULL,  400000, 16),
  ('whisky',    'Johnnie Walker Blue',         '조니워커 블루',          NULL,  900000, 17),
  -- HARD LIQUOR
  ('liqueur',   'Peachtree',                   '피치트리',               NULL,  180000, 20),
  ('liqueur',   'Malibu',                      '말리부',                 NULL,  180000, 21),
  ('vodka',     'Absolut',                     '앱솔루트',               'Grapefruit / Pear / Plain', 180000, 22),
  ('liqueur',   'Fireball',                    '파이어볼',               NULL,  180000, 23),
  ('tequila',   'Jose Cuervo',                 '호세쿠엘보',             NULL,  190000, 24),
  ('liqueur',   'Jagermeister',                '예거마이스터',           NULL,  200000, 25),
  ('liqueur',   'Jagermeister Orange',         '예거마이스터 오렌지',    NULL,  200000, 26),
  ('gin',       'Bombay Sapphire',             '봄베이 사파이어',        NULL,  200000, 27),
  ('whisky',    'Jameson',                     '제임슨',                 NULL,  200000, 28),
  ('liqueur',   'Agwa',                        '아그와',                 NULL,  230000, 29),
  ('liqueur',   'Tina',                        '티나',                   'Strawberry / Green grapes / Melon', 200000, 30),
  ('vodka',     'Grey Goose',                  '그레이구스',             NULL,  250000, 31),
  ('gin',       'Hendrick''s Gin',             '핸드릭스',               NULL,  250000, 32),
  ('tequila',   '1800 Reposado',               '1800 레포사도',          NULL,  250000, 33),
  ('tequila',   'Patron Silver',               '패트론실버',             NULL,  450000, 34),
  ('tequila',   'Don Julio 1942',              '돈훌리오 1942',          NULL,  900000, 35)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'dafb3e5c-919d-4cbc-9363-6e8797dcf631', category, name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- CHAMPAGNE BOTTLE SET (1.jpg) — 같은 술 다병 → variant
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'champagne',
          'Rapel Moscato Bottle Set', '라펠 모스카토 보틀 세트', 40)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('2 bottles',  '2병', 150000, 1),
  ('3 bottles',  '3병', 200000, 2),
  ('5 bottles',  '5병', 300000, 3),
  ('10 bottles', '10병', 600000, 4)
) AS v(label_en, label_ko, price, ord);

WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  VALUES ('dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'champagne',
          'Moet & Chandon Bottle Set', '모엣상동 보틀 세트', 41)
  RETURNING id
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord FROM ins,
(VALUES
  ('2 bottles', '2병',  550000, 1),
  ('3 bottles', '3병',  750000, 2),
  ('5 bottles', '5병', 1200000, 3)
) AS v(label_en, label_ko, price, ord);

-- SET DRINKS (1.jpg) — 선택형 세트
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Set Drinks A', '세트 드링크 A',
   'Rapel Moscato + choice of 1 (Malibu / Peachtree / Absolut)', 250000, 50),
  ('Set Drinks B', '세트 드링크 B',
   'Rapel Moscato + choice of 1 (Tina / Jameson / Jose Cuervo / Jack Daniel''s Apple / Victoire Prestige Luminous)', 300000, 51),
  ('Set Drinks C', '세트 드링크 C',
   'Absolut + Rapel Moscato + choice of 1 (Malibu / Peachtree / Fireball)', 400000, 52),
  ('Set Drinks D', '세트 드링크 D',
   'Absolut + Rapel Moscato + choice of 1 (Tina / Jameson / Jose Cuervo / Jack Daniel''s Apple / Victoire Prestige Luminous)', 450000, 53),
  ('Midday Set', '미드데이 세트',
   'Absolut + Victoire Prestige Luminous + choice of 1 (Tina / Hendrick''s Gin / 1800 Reposado / Johnnie Walker Black)', 550000, 54),
  ('Sundown Set', '선다운 세트',
   '1800 Reposado + Victoire Prestige Luminous x 2 + choice of 1 (Tina / Hendrick''s Gin / 1800 Reposado / Johnnie Walker Black)', 900000, 55)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  SELECT 'dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'set', name_en, name_ko, description,
         '2바틀 이상 세트주문시 음료 세트 및 과일 세트 제공', ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- Set Drinks A / C 택1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES ('Malibu','말리부',1),('Peachtree','피치트리',2),('Absolut','앱솔루트',3)) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631' AND i.name_en = 'Set Drinks A';

INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES ('Malibu','말리부',1),('Peachtree','피치트리',2),('Fireball','파이어볼',3)) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631' AND i.name_en = 'Set Drinks C';

-- Set Drinks B / D 택1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Tina','티나',1),
  ('Jameson','제임슨',2),
  ('Jose Cuervo','호세쿠엘보',3),
  ('Jack Daniel''s Apple','잭다니엘 애플',4),
  ('Victoire Prestige Luminous','빅투아프레스티지 루미너스',5)
) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631'
  AND i.name_en IN ('Set Drinks B', 'Set Drinks D');

-- Midday / Sundown 택1 후보
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Tina','티나',1),
  ('Hendrick''s Gin','핸드릭스진',2),
  ('1800 Reposado','1800 레포사도',3),
  ('Johnnie Walker Black','조니워커블랙',4)
) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631'
  AND i.name_en IN ('Midday Set', 'Sundown Set');

-- BEER SET (1.jpg)
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Corona Set',    '코로나 세트',    'Corona 4 + 1 bottles',    40000, 60),
  ('Budweiser Set', '버드와이저 세트','Budweiser 5 + 1 bottles', 50000, 61)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'set', name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- DAWN SET (2.jpg) — 대형 샴페인 세트
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Dawn Set A',       '던 세트 A',      'Victoire Prestige Luminous x 2 + Rapel Moscato x 2',    500000, 70),
  ('Dawn Special Set', '던 스페셜 세트', 'Victoire Prestige Luminous x 3',                        600000, 71),
  ('Dawn Set B',       '던 세트 B',      'Moet & Chandon x 2 + Victoire Prestige Luminous + Rapel Moscato', 800000, 72),
  ('Dawn Set C',       '던 세트 C',      'Dom Perignon + Rapel Moscato x 3',                     1100000, 73)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'set', name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- VIP / MVIP SET (선택형 + is_vvip)
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('VIP Set',  'VIP 세트',  'Dom Perignon + choice of 1 (Moet & Chandon x 4 / Moet & Chandon N.I.R Rose x 4)', 2000000, 80),
  ('MVIP Set', 'MVIP 세트', 'Dom Perignon x 3 + choice of 1 (Moet & Chandon x 3 / Moet & Chandon N.I.R Rose x 3)', 3600000, 81)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, is_vvip, sort_order)
  SELECT 'dafb3e5c-919d-4cbc-9363-6e8797dcf631', 'set', name_en, name_ko, description, TRUE, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'Set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Moet & Chandon x 4','모엣 상동 4병',1),
  ('Moet & Chandon N.I.R Rose x 4','모엣 상동 니르 로제 4병',2)
) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631' AND i.name_en = 'VIP Set';

INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Moet & Chandon x 3','모엣 상동 3병',1),
  ('Moet & Chandon N.I.R Rose x 3','모엣 상동 니르 로제 3병',2)
) AS c(name_en,name_ko,ord)
WHERE i.club_id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631' AND i.name_en = 'MVIP Set';


-- ═══ Day&night (이태원) ═══
-- 출처: 사진 1장 — 주류 메뉴판이 아님 (TABLE RESERVE GUIDE, 좌석 배치도 + 존별 테이블 최소금액표)
-- 처리: 주류 항목 없음 → club_menu_items INSERT 없음.
--       테이블 최소금액(스탠딩 200~300 / ZONE A 500~650 / ZONE B 600~650 / ZONE C 1,000~1,500 천원)은
--       음료차지(table_charge)가 아니라 좌석 최소주문금액이므로 clubs 컬럼도 건드리지 않음.
--       ※ 실제 주류 메뉴판 사진 확보 필요


-- ═══ The Mansion (이태원) ═══
-- 출처: 사진 1장 (Standing Table Special Bottle 섹션만 사용)
-- 특이사항: 가격이 천원 단위 축약 표기 ("89.0" = 89,000) → 환산 반영
--           / SHOT, SHOT SET, BEER, COCKTAIL, EASY MIX, SOJU COCKTAILS, BEVERAGE 는 잔 단위라 제외
--           / 병 단위는 'Standing Table Special Bottle' 10종뿐
--           / 테이블차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'ba6372ad-e921-48d4-9212-919ecd0181f5';

WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('vodka',     'SKYY',                            '스카이 보드카',            89000,  1),
  ('liqueur',   'Fireball',                        '파이어볼',                 89000,  2),
  ('liqueur',   'Lemon Drop Bottle',               '레몬드롭 보틀',            89000,  3),
  ('liqueur',   'Hpnotiq',                         '힙노틱',                   99000,  4),
  ('liqueur',   'Agwa',                            '아그와',                   99000,  5),
  ('whisky',    'Jameson',                         '제임슨',                   99000,  6),
  ('champagne', 'Diablo Luminous Brut',            '디아블로 루미너스 브뤼',  140000,  7),
  ('champagne', 'Moet & Chandon',                  '모엣 샹동',               200000,  8),
  ('champagne', 'Dom Perignon Vintage Luminous',   '돔 페리뇽 빈티지 루미너스', 900000, 9),
  ('champagne', 'Armand de Brignac Brut Gold',     '아르망 드 브리냑 브뤼 골드', 1500000, 10)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT 'ba6372ad-e921-48d4-9212-919ecd0181f5', category, name_en, name_ko,
         'Standing Table Special Bottle', ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ═══ Libertine (광주) ═══
-- 출처: 사진 6장
-- 특이사항:
--   - LOUIS XIII는 "₩ 가격문의"로 가격 미표기 → 제외 (추측 금지)
--   - 병수 세트(3/5/10병)는 단품 item의 variant로 병합 (SONO/DEEP/MOET/QUEEN/KING/RL/LUC 4종)
--   - "퍼레이드 SET"(SV샴 조합)은 별도 set 카테고리 item으로 등록
--   - 마지막 장 "LADY ONLY PROMOTION / ANY BOTTLE / 아무 바틀이나 한병 이상 주문 시"는
--     혜택 내용이 잘려 확인 불가 → 미등록
--   - 테이블 차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = '8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f';

-- ── 단품 (HARD BOTTLE + 세트 없는 CHAMPAGNE) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('rum',       'Malibu',                   '말리부',                 250000,  1),
  ('liqueur',   'Jagermeister',             '예거마이스터',           250000,  2),
  ('gin',       'Bombay Sapphire',          '봄베이 사파이어',        250000,  3),
  ('whisky',    'Jack Daniel''s',           '잭 다니엘',              250000,  4),
  ('whisky',    'Jack Daniel''s Honey',     '잭 다니엘 허니',         250000,  5),
  ('tequila',   'Jose Cuervo',              '호세 쿠엘보',            250000,  6),
  ('liqueur',   'Agwa',                     '아구와',                 250000,  7),
  ('liqueur',   'X-Rated',                  '엑스레이티드',           250000,  8),
  ('liqueur',   'Hpnotiq',                  '힙노틱',                 250000,  9),
  ('champagne', 'Cuperly Grand Cru',        '뀌뻘리 그랑크뤼',        800000, 30),
  ('champagne', 'Dom Perignon',             '돔 페리뇽',             1500000, 31),
  ('champagne', 'Armand de Brignac',        '아르망 드 브리냑',      2500000, 32)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── 샴페인 병수 세트 (1병 + 3/5/10병 세트가) ──
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Sono Blanc de Blanc',    '소노 블랑 드 블랑',       250000,  700000, 1150000, 2200000, 20),
  ('Deep Luminous',          '딥 루미너스',             250000,  700000, 1150000, 2200000, 21),
  ('Luc Belaire Rare Rose',  '럭 벨레어 레어 로제',     250000,  700000, 1150000, 2200000, 22),
  ('Queen',                  '퀸',                      250000,  700000, 1150000, 2200000, 23),
  ('King',                   '킹',                      300000,  800000, 1300000, 2700000, 24),
  ('RL',                     '알엘',                    300000,  800000, 1300000, 2700000, 25),
  ('Moet & Chandon',         '모엣 샹동',               300000,  850000, 1400000, 2700000, 26),
  ('Luc Belaire Rare Luxe',  '럭 벨레어 레어 럭스',     300000,  850000, 1400000, 2700000, 27),
  ('Luc Belaire Luxe Rose',  '럭 벨레어 럭스 로제',     350000, 1000000, 1650000, 3200000, 28),
  ('Luc Belaire Blue',       '럭 벨레어 블루',          350000, 1000000, 1650000, 3200000, 29)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle','1병',src.p1,1),('3 bottle set','3병',src.p3,2),
  ('5 bottle set','5병',src.p5,3),('10 bottle set','10병',src.p10,4)
) AS v(label_en, label_ko, price, ord);

-- ── 샴페인 단품 (세트 없음, N.I.R) ──
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Moet & Chandon N.I.R', '모엣 샹동 니르', 450000, 33)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;

-- ── 퍼레이드 SET (조합 세트) ──
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Parade Set - SV Champagne 2B + Montezuma', '퍼레이드 세트 - SV샴 2병 + 몬테주마',
   'SV샴(크루즈 블랑 드 블랑) 2병 + 몬테주마 1병', 300000, 40),
  ('Parade Set - Deep 2B + SV Champagne',      '퍼레이드 세트 - 딥 2병 + SV샴',
   '딥 루미너스 2병 + SV샴 1병', 550000, 41),
  ('Parade Set - Sono 2B + SV Champagne',      '퍼레이드 세트 - 소노 2병 + SV샴',
   '소노 2병 + SV샴 1병', 550000, 42),
  ('Parade Set - Queen 2B + SV Champagne',     '퍼레이드 세트 - 퀸 2병 + SV샴',
   '퀸 2병 + SV샴 1병', 550000, 43),
  ('Parade Set - King 2B + SV Champagne',      '퍼레이드 세트 - 킹 2병 + SV샴',
   '킹 2병 + SV샴 1병', 650000, 44),
  ('Parade Set - RL 2B + SV Champagne',        '퍼레이드 세트 - 알엘 2병 + SV샴',
   'RL 2병 + SV샴 1병', 650000, 45),
  ('Parade Set - NIR + SV Champagne',          '퍼레이드 세트 - 니르 + SV샴',
   '모엣 샹동 N.I.R 1병 + SV샴 1병', 500000, 46)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT '8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f', 'set', name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 set', '1세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ Veil Social Club (광주) ═══
-- 출처: 사진 2장 (모두 Set Menu 페이지)
-- 특이사항:
--   - 단품 바틀 가격표는 사진에 없음. 세트 메뉴 4종만 확인됨
--   - Basic Set: "250,000₩ ~" (하드바틀 선택에 따라 변동) → 하드바틀 7종을 choices로 등록,
--     아구와/엑스/힙노틱 선택 시 extra_price 50,000
--   - Premium Set: 클라세 아줄 or 조니워커 블루(택1, slot 1) + 샴페인 5종 중 택1(slot 2).
--     샴페인 선택에 따라 총액이 달라져 variant 5개로 등록
--   - 테이블 차지 문구 없음 → clubs 미변경

DELETE FROM club_menu_items WHERE club_id = 'bb929c21-bd6d-4766-85c6-2b51452058da';

-- ── Basic Set (하드바틀 택1 + 오페라 프리마 골드) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, condition_note, sort_order)
  VALUES ('bb929c21-bd6d-4766-85c6-2b51452058da', 'set',
          'Basic Set', '베이직 세트',
          '하드바틀 1병 + 오페라 프리마 골드 1병',
          '※ 하드바틀 : 말리부 / 호세쿠엘보 / 예거마이스터 / 잭다니엘 中 선택 ( 아구와, 엑스, 힙노틱 中 선택시 5만원 추가 )',
          1)
  RETURNING id
),
v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT id, '1 set', '1세트', 250000, 1 FROM ins
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, extra_price, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.extra, c.ord
FROM ins CROSS JOIN (VALUES
  ('Malibu',       '말리부',       0,     1),
  ('Jose Cuervo',  '호세쿠엘보',   0,     2),
  ('Jagermeister', '예거마이스터', 0,     3),
  ('Jack Daniel''s','잭다니엘',    0,     4),
  ('Agwa',         '아구와',       50000, 5),
  ('X-Rated',      '엑스',         50000, 6),
  ('Hpnotiq',      '힙노틱',       50000, 7)
) AS c(name_en, name_ko, extra, ord);

-- ── Cartes de Cour Set (Queen Rosé / King Gold) ──
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Queen Rose Set', '퀸 로제 세트',
   '퀸 로제 2병 or 카보닉 블루 2병 + 오페라 프리마 골드 1병', 600000, 2),
  ('King Gold Set',  '킹 골드 세트',
   '킹 골드 2병 or 카보닉 2병 + 오페라 프리마 골드 1병',      700000, 3)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT 'bb929c21-bd6d-4766-85c6-2b51452058da', 'set', name_en, name_ko, description, ord FROM src
  RETURNING id, name_en
),
v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, '1 set', '1세트', src.price, 1
  FROM ins JOIN src ON src.name_en = ins.name_en
  RETURNING item_id
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, 1, c.name_en, c.name_ko, c.ord
FROM ins JOIN (VALUES
  ('Queen Rose Set', 'Queen Rose',     '퀸 로제',     1),
  ('Queen Rose Set', 'Carbonic Blue',  '카보닉 블루', 2),
  ('King Gold Set',  'King Gold',      '킹 골드',     1),
  ('King Gold Set',  'Carbonic',       '카보닉',      2)
) AS c(item_name, name_en, name_ko, ord) ON c.item_name = ins.name_en;

-- ── Premium Set (클라세 아줄 or 조니워커 블루 + 샴페인 5종 중 택1) ──
WITH ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  VALUES ('bb929c21-bd6d-4766-85c6-2b51452058da', 'set',
          'Clase Azul or Johnnie Walker Blue Set', '클라세 아줄 or 조니워커 블루 세트',
          '클라세 아줄 1병 or 조니워커 블루 1병 + 아래 5종 중 택 1병',
          4)
  RETURNING id
),
v AS (
  INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
  SELECT ins.id, x.label_en, x.label_ko, x.price, x.ord
  FROM ins CROSS JOIN (VALUES
    ('+ Carbonic Blue',        '+ 카보닉 블루',        1600000, 1),
    ('+ Carbonic',             '+ 카보닉',             1650000, 2),
    ('+ Moet & Chandon N.I.R', '+ 모엣 샹동 니르',     1800000, 3),
    ('+ Dom Perignon',         '+ 돔페리뇽',           2800000, 4),
    ('+ Armand de Brignac',    '+ 아르망디 브리냑',    3800000, 5)
  ) AS x(label_en, label_ko, price, ord)
  RETURNING item_id
)
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, sort_order)
SELECT ins.id, c.slot, c.name_en, c.name_ko, c.ord
FROM ins CROSS JOIN (VALUES
  (1, 'Clase Azul',           '클라세 아줄',      1),
  (1, 'Johnnie Walker Blue',  '조니워커 블루',    2),
  (2, 'Carbonic Blue',        '카보닉 블루',      1),
  (2, 'Carbonic',             '카보닉',           2),
  (2, 'Moet & Chandon N.I.R', '모엣 샹동 니르',   3),
  (2, 'Dom Perignon',         '돔페리뇽',         4),
  (2, 'Armand de Brignac',    '아르망디 브리냑',  5)
) AS c(slot, name_en, name_ko, ord);

-- ═══ Azit (부산) ═══
-- 출처: 사진 5장 (CHAMPAGNE / CHAMPAGNE SET x2 / HARD BOTTLE MENU / BAR BOTTLE MENU)
-- 특이사항:
--   1) BAR 바틀 메뉴는 홀(테이블) 가격과 별개의 저렴한 가격대라 zone='BAR'로 분리.
--      홀 메뉴 아이템은 zone=NULL(기본). 동일 술이 두 가격대로 존재 → name_en에 ' (Bar)' 접미사로 중복 회피.
--   2) 3B/5B/10B 세트는 동일 술의 병수 옵션이므로 별도 item 없이 variant로 통합.
--      단일병 메뉴가 없는 Dom Perignon Luminous 세트는 CHAMPAGNE의 Dom Perignon(1,200,000)과 동일 제품으로 보고 병합.
--   3) 테이블 차지 표기 없음 → clubs 미변경.
--   4) BAR 메뉴 하단 안내문(입장료 면제 / 3B 이상 전광문구·퍼레이드 / 에프터 5만원 추가할인)은
--      해당 BAR 아이템 condition_note에 원문 그대로 기록.
--   5) 잔 단위(칵테일/샷/맥주) 메뉴는 사진에 없음. 테이블 배치도(플로어맵) 사진 없음.
--   6) 'RL LUMINUS'(단품 표기) / 'RL LUMINOUS'(세트 표기) 철자가 메뉴판에서 상이 → 'RL Luminous'로 통일.

DELETE FROM club_menu_items WHERE club_id = 'c8e912c9-6ac4-45f6-91ec-6eb74e6421d0';

-- ─────────────────────────────────────────────
-- 1. 홀 메뉴: 단일 가격 아이템 (1병만 존재)
-- ─────────────────────────────────────────────
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  -- CHAMPAGNE (사진 3)
  ('champagne', 'Cartes de Cour King Gold',    '카르트 드 쿠어 킹 골드',   250000,  3),
  ('champagne', 'Cartes de Cour Queen Rose',   '카르트 드 쿠어 퀸 로제',   250000,  4),
  ('champagne', 'Illumi-Light',                '일루미 라이트',            250000,  5),
  ('champagne', 'Moet & Chandon Luminous Magnum', '모엣 매그넘',           700000,  7),
  ('champagne', 'Angel Rose',                  '엔젤 로제',               1400000, 11),
  ('champagne', 'Dom Perignon Rose Luminous',  '돔페리뇽 로제',           1500000, 12),
  ('champagne', 'Angel Vintage Gold',          '엔젤 골드',               2000000, 13),
  ('champagne', 'Dom Perignon Magnum',         '돔페리뇽 매그넘',         2400000, 15),
  ('champagne', 'Armand de Demi Sec',          '아르망디 드미섹',         2500000, 16),
  ('champagne', 'Armand de Green',             '아르망디 그린',           2500000, 17),
  ('champagne', 'Armand de Rose',              '아르망디 로제',           2500000, 18),
  ('champagne', 'Armand de Brignac Magnum',    '아르망디 매그넘',         4000000, 19),
  ('cognac',    'Louis XIII',                  '루이 13세',              15000000, 20),
  -- HARD BOTTLE MENU (사진 2)
  ('liqueur',   'Jagermeister',                '예거마이스터',             200000, 31),
  ('rum',       'Malibu',                      '말리부',                   200000, 32),
  ('tequila',   'Jose Cuervo',                 '호세쿠엘보',               200000, 33),
  ('gin',       'Bombay Sapphire',             '봄베이',                   200000, 34),
  ('vodka',     'Absolut',                     '앱솔루트',                 200000, 35),
  ('whisky',    'Jack Daniels',                '잭다니엘',                 250000, 36),
  ('liqueur',   'X-Rated',                     '엑스레이티드',             250000, 37),
  ('liqueur',   'Agwa',                        '아그와',                   250000, 38),
  ('liqueur',   'Hpnotiq',                     '힙노틱',                   250000, 39),
  ('tequila',   '818 Reposado',                '818 레포사도',             400000, 40)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c8e912c9-6ac4-45f6-91ec-6eb74e6421d0', category, name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ─────────────────────────────────────────────
-- 2. 홀 메뉴: 병수 세트가 있는 샴페인 (1병 + 3B/5B/10B)
--    사진 1(ANGEL LUMINOUS/RICHARD BAVION/DOM PERIGNON/ARMAND DE BRIGNAC)
--    사진 4(RL LUMINOUS/RL MOSCATO/MOET N.I.R)
-- ─────────────────────────────────────────────
WITH src(name_en, name_ko, ord, p1, p3, p5, p10) AS (VALUES
  ('RL Moscato',           '알엘 모스카토',   1,   250000,   750000,  1200000,  2300000),
  ('RL Luminous',          '알엘 루미너스',   2,   250000,   750000,  1200000,  2300000),
  ('Moet & Chandon N.I.R', '모엣 N.I.R',      6,   400000,  1150000,  1900000,  3800000),
  ('Angel Luminous',       '엔젤 루미너스',   8,  1000000,  2900000,  4600000,  9000000),
  ('Richard Bavion',       '리샤르 바비옹',   9,  1000000,  2900000,  4600000,  9000000),
  ('Dom Perignon',         '돔페리뇽',       10,  1200000,  3500000,  5600000, 11000000),
  ('Armand de Brignac',    '아르망디',       14,  2200000,  6400000, 10000000, 20000000)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c8e912c9-6ac4-45f6-91ec-6eb74e6421d0', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, x.label_en, x.label_ko, x.price, x.vord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle', '1병',      src.p1,  1),
  ('3B SET',   '3병 세트',  src.p3,  2),
  ('5B SET',   '5병 세트',  src.p5,  3),
  ('10B SET',  '10병 세트', src.p10, 4)
) AS x(label_en, label_ko, price, vord);


-- ─────────────────────────────────────────────
-- 3. BAR BOTTLE MENU (사진 5) — 홀보다 저렴한 별도 가격대, zone='BAR'
-- ─────────────────────────────────────────────
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('champagne', 'Illumi-Light (Bar)',              '일루미 라이트',           200000, 51),
  ('champagne', 'RL Moscato (Bar)',                '알엘 모스카토',           200000, 52),
  ('champagne', 'RL Luminous (Bar)',               '알엘 루미너스',           200000, 53),
  ('champagne', 'Cartes de Cour King Gold (Bar)',  '카르트 드 쿠어 킹 골드',  200000, 54),
  ('champagne', 'Cartes de Cour Queen Rose (Bar)', '카르트 드 쿠어 퀸 로제',  200000, 55),
  ('liqueur',   'X-Rated (Bar)',                   '엑스레이티드',            200000, 56),
  ('liqueur',   'Agwa (Bar)',                      '아그와',                  200000, 57),
  ('liqueur',   'Hpnotiq (Bar)',                   '힙노틱',                  200000, 58),
  ('liqueur',   'Jagermeister (Bar)',              '예거마이스터',            150000, 59),
  ('tequila',   'Jose Cuervo (Bar)',               '호세쿠엘보',              150000, 60),
  ('rum',       'Malibu (Bar)',                    '말리부',                  150000, 61)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, zone, condition_note, sort_order)
  SELECT 'c8e912c9-6ac4-45f6-91ec-6eb74e6421d0', category, name_en, name_ko, 'BAR',
         'BAR 바틀 구매시 남성 입장료 면제 / 3B 이상시 전광문구 및 퍼레이드 가능 / 에프터 BAR 바틀 5만원 추가 할인',
         ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;
