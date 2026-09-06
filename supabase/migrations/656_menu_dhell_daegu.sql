-- ============================================================================
-- Migration 656: 메뉴 데이터 — D.hell (대구)
--
-- 646에서 메뉴판 사진이 있던 29곳을 채웠고, 그 뒤 D.hell 주대표 6장 + 테이블맵
-- 1장이 clubs.drink_menu_urls / floor_plan_url 에 올라와 같은 방식으로 옮긴다.
-- 이로써 대구는 브리드(BREED)에 이어 2곳이 된다.
--
-- 출처: 사진 6장
--   drink-0 SINGLE BOTTLE (NORMAL&STANDARD / PREMIUM / VIP SINGLE)
--   drink-1 SINGLE BOTTLE (CHAMPAGNE)
--   drink-2 STANDARD SET (SET 1~4)
--   drink-3 CHAMPAGNE SET MENU 1 (3B/5B/10B)
--   drink-4 CHAMPAGNE SET MENU 2 (3B/5B/10B)
--   drink-5 CHAMPAGNE SPECIAL ORDERS (전량 "가격문의")
--
-- 읽으면서 확인된 것들:
--   · 단품 샴페인(drink-1)과 세트 샴페인(drink-3/4)이 같은 품목이라 한 item에
--     1B/3B/5B/10B variant 4개로 합쳤다. 브리드와 같은 구조다.
--     교차검증: 보르고 풀비아 1B 7만 → 3B 21만(정확히 3배), 5B 30만, 10B 60만.
--     디아블로 1B 15만 → 3B 45만(3배). 단품가와 세트가가 어긋나지 않는다.
--   · drink-2 STANDARD SET 4종은 품목이 고정된 조합이라 선택형(choices)이 아닌
--     set 카테고리 + description으로 구성을 적는다. 손님이 고를 게 없다.
--     SET 2(보르고풀비아 5B 30만)는 drink-3의 5B 30만과 동일 — 중복이지만
--     메뉴판이 양쪽에 다 실어놓았고, 손님이 "STANDARD SET" 이름으로 찾을 수
--     있어 그대로 둔다.
--   · drink-5 SPECIAL ORDERS 6종은 전부 "가격문의"라 제외한다. 가격이 없는
--     항목을 넣으면 손님 화면에서 총액이 안 잡히고, 지어내면 현장 청구액과
--     어긋나 클레임이 된다(646과 같은 기준).
--   · VIP SINGLE 4종은 is_vvip=TRUE. 클라세 아줄 레포사도 80만이 최고가.
--   · BAR PROMOTION 70,000 (평일/주말 12시 이전)은 금액이 아닌 조건부 프로모션.
--     테이블 차지가 아니므로 clubs.table_charge_* 에 넣지 않고, 해당 섹션
--     항목들의 condition_note로 남긴다. 메뉴판에 테이블차지 문구는 없다.
--   · 잔 단위는 메뉴판에 없다 — 전량 병 단위.
--
-- 결과: 항목 35개 / 가격옵션 68개 (그중 VVIP 9개)
-- ⚠️ 645(wine 카테고리)와 642(스키마) 적용 후에 실행해야 한다.
-- ============================================================================

-- ═══ D.hell (대구) ═══
-- 테이블차지 문구 없음 → clubs 미변경 (NULL 유지 = 미확인)

DELETE FROM club_menu_items WHERE club_id = '5d1fd280-7656-491f-a335-9b4dd87c0d2a';


-- ── NORMAL & STANDARD 단품 (drink-0) ──
-- BAR PROMOTION 70,000 / 평일·주말 12시 이전
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('rum',     'Bacardi Mojito',       '바카디 모히또',   100000,  1),
  ('liqueur', 'Peachtree',            '피치트리',       100000,  2),
  ('whisky',  'White Walker',         '화이트워커',      100000,  3),
  ('liqueur', 'Malibu',               '말리부',         110000,  4),
  ('tequila', 'Jose Cuervo',          '호세쿠엘보',      110000,  5),
  ('liqueur', 'Jägermeister',         '예거 마이스터',   110000,  6),
  ('whisky',  'Jack Daniel''s',       '잭다니엘',       110000,  7),
  ('whisky',  'Jack Daniel''s Honey', '잭다니엘 허니',   110000,  8),
  ('whisky',  'Jack Daniel''s Apple', '잭다니엘 애플',   110000,  9)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', category, name_en, name_ko,
         '바 프로모션 70,000원 (평일/주말 12시 이전)', ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ── PREMIUM 단품 (drink-0) ──
-- BAR PROMOTION 70,000 / 평일·주말 12시 이전
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('liqueur', 'X-Rated',          '엑스레이티드',     120000, 20),
  ('liqueur', 'Hpnotiq',          '힙노틱',          120000, 21),
  ('whisky',  'Jameson',          '제임슨',          120000, 22),
  ('gin',     'Bombay Sapphire',  '봄베이 사파이어',  120000, 23),
  ('liqueur', 'CL Cocalero',      'CL 코카레로',     120000, 24)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', category, name_en, name_ko,
         '바 프로모션 70,000원 (평일/주말 12시 이전)', ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ── VIP SINGLE (drink-0) ──
WITH src(category, name_en, name_ko, price, ord) AS (VALUES
  ('cognac',  'Hennessy V.S.O.P',       '헤네시 V.S.O.P',      250000, 30),
  ('whisky',  'Monkey Shoulder',        '몽키 숄더',           250000, 31),
  ('tequila', 'Patrón Silver',          '패트론 실버',         250000, 32),
  ('tequila', 'Clase Azul Reposado',    '클라세 아줄 레포사도',  800000, 33)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', category, name_en, name_ko, TRUE, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ── CHAMPAGNE : 단품 + 세트 통합 (drink-1 + drink-3 SET MENU 1) ──
-- 1B는 drink-1, 3B/5B/10B는 drink-3에서 왔다.
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Borgo Fullbia',    '보르고 풀비아',   70000,  210000,  300000,  600000, 40),
  ('Diablo',           '디아블로',       150000,  450000,  700000, 1300000, 41),
  ('Luc Belaire Rose', '룩벨레어 로제',   250000,  700000, 1100000, 2000000, 42),
  ('Luc Belaire Luxe', '룩벨레어 럭스',   250000,  700000, 1100000, 2000000, 43),
  ('Carbonic',         '카보닉',         300000,  700000, 1100000, 2200000, 44),
  ('Carbonic White',   '카보닉 화이트',   300000,  700000, 1100000, 2200000, 45),
  ('RL Luminous',      'RL 루미너스',    300000,  700000, 1100000, 2200000, 46)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle',      '1병',     src.p1,  1),
  ('3 bottle set',  '3병 세트', src.p3,  2),
  ('5 bottle set',  '5병 세트', src.p5,  3),
  ('10 bottle set', '10병 세트', src.p10, 4)
) AS v(label_en, label_ko, price, ord);


-- ── CHAMPAGNE : 단품 + 세트 통합 (drink-1 + drink-4 SET MENU 2, VVIP) ──
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Moet N.I.R',              '모엣 니르 (N.I.R)',  300000,   900000,  1400000,  2800000, 50),
  ('Angel Luminous',          '엔젤 루미너스',       900000,  2500000,  4000000,  8000000, 51),
  ('Dom Pérignon Luminous',   '돔페리뇽 루미너스',  1100000,  3000000,  5000000, 10000000, 52),
  ('Armand de Brignac',       '아르망디 브리낙',    2000000,  5500000,  9000000, 18500000, 53)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', 'champagne', name_en, name_ko, TRUE, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle',      '1병',     src.p1,  1),
  ('3 bottle set',  '3병 세트', src.p3,  2),
  ('5 bottle set',  '5병 세트', src.p5,  3),
  ('10 bottle set', '10병 세트', src.p10, 4)
) AS v(label_en, label_ko, price, ord);


-- ── CHAMPAGNE 단품 전용 (세트 없음, drink-1) ──
-- 모엣샹동과 모엣 골드라이트 매그넘은 SET MENU에 없어 1B만 있다.
WITH src(name_en, name_ko, price, is_vvip, ord) AS (VALUES
  ('Moët & Chandon',                '모엣샹동',              200000, FALSE, 47),
  ('Moët Goldenlight Magnum',       '모엣 골드라이트 매그넘',  700000, TRUE,  48)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', 'champagne', name_en, name_ko, is_vvip, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ── STANDARD SET (drink-2) ──
-- 품목이 고정된 조합이라 choices 없이 description으로 구성을 적는다.
WITH src(name_en, name_ko, description, price, ord) AS (VALUES
  ('Standard Set 1', '스탠다드 세트 1', '엑스레이티드 3병',              300000, 60),
  ('Standard Set 2', '스탠다드 세트 2', '보르고 풀비아 5병',             300000, 61),
  ('Standard Set 3', '스탠다드 세트 3', '호세쿠엘보 1병 + 디아블로 3병',   500000, 62),
  ('Standard Set 4', '스탠다드 세트 4', '카보닉 1병 + 보르고 풀비아 3병',  500000, 63)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, description, sort_order)
  SELECT '5d1fd280-7656-491f-a335-9b4dd87c0d2a', 'set', name_en, name_ko, description, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, 'set', '세트', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;
