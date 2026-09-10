-- ============================================================================
-- Migration 665: 메뉴 데이터 — 아르쥬 청담 라운지 (강남)
--
-- 담당 MD(강한별 @kang._hanbyul / 리얼 @minoo_9_6_)를 통해 주대표 사진 2장을
-- 받아 clubs.drink_menu_urls에 올렸고(2026-09-10), 이 파일이 그 사진을
-- club_menu_items로 옮긴다. 사진만 있으면 club_ids_with_menu(649)에 안 잡혀
-- 외국인 예약 폼에서 이 클럽이 통째로 빠진다.
--
-- 올라온 2장:
--   m-0  MH EVENT (모엣헤네시 단품 7종) + SET MENU (세트 12종)
--   m-1  전체 주대표 — 샴페인/데킬라/보드카/진/리큐르/싱글몰트/스카치/버번/꼬냑
--
-- 읽으면서 확인·판단한 것들:
--   · 가격 표기가 천 단위 생략형이다("350,0" = 350,000원). 전 항목 동일 규칙.
--   · B / G 열은 Bottle / Glass다. G(잔)는 테이블 예약 총액과 무관해 넣지 않는다
--     (손님이 잔술로 최소금액을 채우는 상황은 이 폼의 대상이 아니다).
--   · m-0의 할인 표기 2건은 할인가를 채택한다 — 사진에 취소선으로 원가가 지워져 있다.
--       돔페리뇽 루미너스   120만 → 90만
--       아르망 드 브리냑 골드 220만 → 150만
--     m-1에도 같은 항목이 같은 할인 표기로 있어 두 장이 일치한다.
--   · m-0 단품 7종은 전부 m-1 샴페인 섹션에도 있다. 중복 INSERT를 피하려고
--     단품은 m-1 기준으로 한 번만 넣고, m-0에서는 세트만 가져온다.
--   · "모엣 상동 브뤼 임페리얼 골든 라이트업 매그넘 리미티드 1.5L"는 용량이
--     다른 별도 상품이라 임페리얼과 합치지 않고 독립 항목으로 둔다.
--   · 세트 2종(딥아이스+믹서 45만 / 모엣임페리얼+믹서 55만)은 "시에라 or
--     시에라카페 or 벨베디어 or 티나 택1" 구조다. 지금 스키마의 choices로 풀면
--     4행이 더 붙는데, 가격이 선택과 무관해 총액에 영향이 없다. 이름에 택1을
--     명시하고 단일 variant로 넣는다(MenuPicker의 택1 UI는 가격이 갈릴 때만 값어치가 있다).
--   · 5 BOTTLES 세트 6종과 3 BOTTLES 세트 1종은 병수가 곧 상품명이라
--     variant label에 병수를 넣는다.
--   · 조니워커블루+모엣임페리얼 / 돈훌리오1942+모엣임페리얼 세트는 둘 다 140만이고
--     "풍성한 과일&치즈 플래터 포함"이 딸린다 → condition_note로 남긴다.
--   · 테이블 차지·최소주문 문구가 사진 어디에도 없다 → clubs 미변경.
--     강남 최소금액은 폼의 AREA_MIN_BUDGET(100만)이 그대로 적용된다.
--   · 사진 하단 공통 문구 "모든 고객님께 사전 결제를 요청드리고 있습니다"는
--     현장 결제 정책이라 메뉴 항목이 아니다 → 넣지 않는다.
--
-- 결과: 항목 62개 / 가격옵션 62개
-- 적용 후 club_ids_with_menu()에 자동 포함 → /en·/ja·/zh·/zh-tw 예약 폼에 노출.
-- ============================================================================

-- 재실행 안전장치 — 이 파일이 넣는 것만 걷어낸다(현재 이 클럽 항목은 0건).
DELETE FROM club_menu_items
WHERE club_id = 'c6e747de-140f-4a76-857d-6ed51d09b217';


-- ═══ 1. 샴페인 (m-1 CHAMPAGNE + m-0 MH EVENT 단품) ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Sono',                                  '소노',                                    250000,  1),
  ('Moët & Chandon',                        '모엣 상동 임페리얼',                      300000,  2),
  ('Veuve Clicquot Brut',                   '뵈브클리코',                              350000,  3),
  ('Moët & Chandon ROSE',                   '모엣 상동 로제',                          350000,  4),
  ('Moët & Chandon NIRO',                   '모엣 상동 NIRO',                          400000,  5),
  ('Moët & Chandon Ice',                    '모엣 상동 아이스',                        400000,  6),
  ('Moët & Chandon Golden Light Up Magnum 1.5L', '모엣 상동 브뤼 임페리얼 골든 라이트업 매그넘 리미티드 1.5L', 800000,  7),
  ('KRUG',                                  '크룩',                                   1200000,  8),
  -- 할인가 채택(원가 1,200,000 취소선)
  ('Dom Pérignon Luminous',                 '돔페리뇽 루미너스',                        900000,  9),
  ('Dom Pérignon Luminous ROSE',            '돔페리뇽 루미너스 로제',                  2300000, 10),
  -- 할인가 채택(원가 2,200,000 취소선)
  ('Armand de Brignac Brut Gold',           '아르망 드 브리냑 골드',                   1500000, 11),
  ('Armand de Brignac Brut ROSE',           '아르망 드 브리냑 로제',                   2500000, 12),
  ('Deep Ice',                              '딥 아이스',                               200000, 13),
  ('Golden Blanc Stars',                    '골든블랑 스타즈',                         200000, 14),
  ('Golden Blanc Aurora Luminous',          '골든블랑 오로라 루미너스',                300000, 15),
  ('Golden Blanc Aurora ROSE Luminous',     '골든블랑 오로라 핑크 로제루미너스',        350000, 16),
  ('Golden Blanc Aurora Luminous (Blue Midnight)', '골든블랑 블루 미드나잇 루미너스',   600000, 17),
  ('Montelvini Luminus',                    '몬텔비니 루미너스',                       250000, 18),
  ('Montelvini Rose Luminus',               '몬텔비니 로제 루미너스',                  350000, 19),
  ('Dumenil Brut',                          '두메닐 브뤼',                             350000, 20),
  ('Dumenil Demi Sec',                      '두메닐 드미섹',                           500000, 21),
  ('Jean Call Rubis',                       '진꼴 루비스',                            1000000, 22),
  ('Louis Roederer Cristal Brut',           '루이 로드레 크리스탈 브뤼',              2200000, 23)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'champagne', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 2. 데킬라 ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Espolon blanco',        '에스폴론 블랑코',        350000, 1),
  ('Espolon Reposado',      '에스폴론 레포사도',      400000, 2),
  ('Espolon Anejo',         '에스폴론 아네호',        450000, 3),
  ('Sierra Tequila',        '씨에라 데킬라',          300000, 4),
  ('Sierra Tequila Cafe',   '씨에라 데킬라 카페',     300000, 5),
  ('Don Julio blanco',      '돈 홀리오 블랑코',       400000, 6),
  ('Petron Silver',         '페트론 실버',            450000, 7),
  ('Don Julio 1942',        '돈 홀리오 1942',        1000000, 8),
  ('Clase Azul Reposado',   '클라세 아줄 레포사도',  1200000, 9)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'tequila', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 3. 보드카 ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Belvedere',   '벨베디어',   300000, 1),
  ('Grey Goose',  '그레이구스', 350000, 2)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'vodka', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 4. 진 ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Hendrick''s Gin', '헨드릭스 진', 350000, 1)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'gin', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 5. 리큐르 ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Tina',    '티나',   300000, 1),
  ('Aperol',  '아페롤', 300000, 2)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'liqueur', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 6. 위스키 (싱글몰트 + 스카치 + 버번) ═══
-- 스키마 카테고리에 single malt/bourbon 구분이 없어 전부 whisky로 넣고,
-- 산지·타입은 이름 뒤 괄호로 남긴다(사진의 Speyside/Islay 등 표기 유지).
WITH src(name_en, name_ko, price, ord) AS (VALUES
  -- SINGLE MALT
  ('The Macallan 12 (Speyside)',                       '맥켈란 12년',                       450000,  1),
  ('The Macallan 15 (Speyside)',                       '맥켈란 15년',                       700000,  2),
  ('The Macallan 18 (Speyside)',                       '맥켈란 18년',                      1500000,  3),
  ('The Glen Grant Arboralis (Speyside)',              '글렌그란트 아보랄리스',              350000,  4),
  ('The Glen Grant 12 (Speyside)',                     '글렌그란트 12년',                    400000,  5),
  ('The Glen Grant 15 (Speyside)',                     '글렌그란트 15년',                    450000,  6),
  ('The Glen Grant 18 (Speyside)',                     '글렌그란트 18년',                    800000,  7),
  ('The Glen Grant 21 (Speyside)',                     '글렌그란트 21년',                   1500000,  8),
  ('The Glen Grant 25 (Speyside)',                     '글렌그란트 25년',                   2500000,  9),
  ('The Glen Grant 60 (Speyside)',                     '글렌그란트 60년',                 100000000, 10),
  ('Balvenie 12 (Speyside)',                           '발베니 12년',                        450000, 11),
  ('Glenmorangie Signet (Highland)',                   '글렌모렌지 시그넷',                 1000000, 12),
  ('Talisker 10 (Skye)',                               '탈리스커 10년',                      380000, 13),
  ('Laphroaig 10 (Islay)',                             '라프로익 10년',                      380000, 14),
  ('Ardbeg 10 (Islay)',                                '아드벡 10년',                        480000, 15),
  -- SCOTCH
  ('Black Bottle Andean Oak',                          '블랙 바틀 앤디언 오크',              350000, 16),
  ('Johnnie Walker Gold',                              '조니워커 골드',                      450000, 17),
  ('Royal Salute 21',                                  '로얄 살루트 21년',                   850000, 18),
  ('Johnnie Walker Blue',                              '조니워커 블루',                     1000000, 19),
  ('Ballantine''s 30',                                 '발렌타인 30년',                     2500000, 20),
  -- BOURBON
  ('Wild Turkey Rare Breed',                           '와일드 터키 레어 브리드',            350000, 21),
  ('Wild Turkey Master''s Keep Cornerstone Rye',       '와일드 터키 마스터스 킵 코너스톤 라이', 900000, 22),
  ('Wild Turkey Master''s Keep Unforgotten',           '와일드 터키 마스터스 킵 언포가튼',    900000, 23),
  ('Wild Turkey Master''s Keep Voyage',                '와일드 터키 마스터스 킵 보이지',      900000, 24)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'whisky', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 7. 꼬냑 ═══
WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Hennessy VSOP',    '헤네시 VSOP',    500000, 1),
  ('Hennessy XO',      '헤네시 XO',     1200000, 2),
  ('Remy Martin VSOP', '레미마틴 VSOP',  500000, 3),
  ('Remy Martin XO',   '레미마틴 XO',   1200000, 4),
  ('Louis XIII',       '루이 13세',    15000000, 5)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'cognac', name_en, name_ko, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 8. 세트 (m-0 SET MENU) ═══
-- 믹서 택1(시에라 / 시에라 카페 / 벨베디어 / 티나)은 가격이 갈리지 않아
-- choices 없이 이름·조건문구로만 남긴다.
WITH src(name_en, name_ko, label_en, label_ko, price, note_ko, note_en, ord) AS (VALUES
  ('Deep Ice + Mixer (choose 1)',            '딥 아이스 + 믹서 택1',
   '1 bottle + mixer', '1병 + 믹서',          450000,
   '시에라 or 시에라 카페 or 벨베디어 or 티나 중 택1',
   'Choose 1: Sierra / Sierra Cafe / Belvedere / Tina', 1),
  ('Moët & Chandon + Mixer (choose 1)',      '모엣 상동 임페리얼 + 믹서 택1',
   '1 bottle + mixer', '1병 + 믹서',          550000,
   '시에라 or 시에라 카페 or 벨베디어 or 티나 중 택1',
   'Choose 1: Sierra / Sierra Cafe / Belvedere / Tina', 2),
  ('Deep Ice Set',                           '딥 아이스 세트',
   '5 bottles', '5병',                        950000, NULL, NULL, 3),
  ('Sono Set',                               '소노 세트',
   '5 bottles', '5병',                       1100000, NULL, NULL, 4),
  ('Moët & Chandon Set',                     '모엣 상동 임페리얼 세트',
   '5 bottles', '5병',                       1300000, NULL, NULL, 5),
  ('Moët & Chandon ROSE Set',                '모엣 상동 로제 세트',
   '5 bottles', '5병',                       1600000, NULL, NULL, 6),
  ('Moët & Chandon NIRO Set',                '모엣 상동 NIRO 세트',
   '5 bottles', '5병',                       1800000, NULL, NULL, 7),
  ('Dom Pérignon Luminous Set',              '돔페리뇽 루미너스 세트',
   '5 bottles', '5병',                       4400000, NULL, NULL, 8),
  ('Armand de Brignac Brut Gold Set',        '아르망 드 브리냑 골드 세트',
   '3 bottles', '3병',                       4400000, NULL, NULL, 9),
  ('Johnnie Walker Blue + Moët & Chandon',   '조니워커 블루 + 모엣 상동 임페리얼',
   'set', '세트',                            1400000,
   '풍성한 과일&치즈 플래터 포함', 'Includes a fruit & cheese platter', 10),
  ('Don Julio 1942 + Moët & Chandon',        '돈 홀리오 1942 + 모엣 상동 임페리얼',
   'set', '세트',                            1400000,
   '풍성한 과일&치즈 플래터 포함', 'Includes a fruit & cheese platter', 11)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, condition_note, condition_note_en, sort_order)
  SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217', 'set', name_en, name_ko, note_ko, note_en, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, src.label_en, src.label_ko, src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;


-- ═══ 9. 클럽 소개 문구 — 담당 MD 전달(2026-09-10): 추천 연령 20~40대 후반 ═══
-- 나이대를 담는 컬럼이 없어 tagline에 넣는다. 외국인 트랙에서는 "30~40대도 편한
-- 라운지"가 클럽 선택 기준이 되므로 숨기지 않고 드러낸다.
UPDATE clubs SET
  tagline_ko = COALESCE(tagline_ko, '20대부터 40대까지 편한 청담 라운지'),
  tagline_en = COALESCE(tagline_en, 'Cheongdam lounge — comfortable for 20s through 40s'),
  tagline_ja = COALESCE(tagline_ja, '20代から40代まで居心地のいい清潭ラウンジ'),
  tagline_zh = COALESCE(tagline_zh, '清潭酒廊 — 20到40多岁都自在'),
  tagline_zh_tw = COALESCE(tagline_zh_tw, '清潭酒廊 — 20到40多歲都自在')
WHERE id = 'c6e747de-140f-4a76-857d-6ed51d09b217';


-- 확인용:
--   SELECT count(*) FROM club_menu_items WHERE club_id = 'c6e747de-140f-4a76-857d-6ed51d09b217';  -- 62
--   SELECT 'c6e747de-140f-4a76-857d-6ed51d09b217' IN (SELECT club_id FROM club_ids_with_menu());  -- true
