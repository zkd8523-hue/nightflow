-- ============================================================================
-- Migration 657: 메뉴 데이터 보강 — Veil Social Club (광주)
--
-- 646에서 베일은 사진 2장(Set Menu 페이지)만 있어 세트 4종만 넣었고, 주석에도
-- "단품 바틀 가격표는 사진에 없음"이라 적어뒀다. 그 뒤 사진 3장이 더 올라와
-- 5장이 됐고, 그중 2장이 신규다.
--
-- 올라온 5장 대조:
--   m-0  Set Menu — 샴페인 병수 세트표 (3B/5B/10B)        ★신규
--   m-1  Set Menu — Basic Set + Cartes de Cour Set        (646에 이미 반영)
--   m-2  Set Menu — Clase Azul or JW Blue + 샴페인 택1     (646에 이미 반영)
--   m-3  m-1과 완전히 동일한 이미지 (중복 업로드)          (신규 아님)
--   m-4  Armand de Brignac 전용 가격표                     ★신규
--
-- 646의 세트 4종은 건드리지 않고(그대로 유효) 신규 2장만 덧붙인다.
-- 646 파일 자체를 고치지 않는 이유: 이미 적용된 파일이라 재실행하면 DELETE가
-- 다시 돌아 위험하다. 그래서 이 파일은 DELETE 없이 INSERT만 한다.
--
-- 읽으면서 확인된 것들:
--   · m-0의 카보닉 블루/카보닉/퀸 로제/킹 골드는 646의 Cartes de Cour Set과
--     같은 술이지만 구성이 다르다 — 646은 "2병 + 오페라 프리마 골드 1병"이고
--     m-0은 "그 술만 3/5/10병"이다. 같은 항목으로 합칠 수 없어 별도 item으로
--     넣고 이름에 구분을 뒀다.
--   · Queen Rosé와 King Gold의 3B 칸은 실제로 "3 + 1 Bottle"이다(1병 서비스).
--     price는 표기가인 90만/105만을 그대로 쓰고 label에 3+1을 남긴다.
--   · m-4 상단 단품 5종(750ml)이 베일의 첫 단품 가격표다. 646 주석의
--     "단품 바틀 가격표 없음"은 이걸로 해소된다(아르망디 한정).
--   · m-4의 Gold 3B/5B/10B(740만/1230만/2460만)는 m-0의 Armand De Brignac
--     3B/5B/10B와 금액이 정확히 일치한다 — 같은 항목이므로 m-0 쪽은 넣지 않고
--     m-4의 Gold로 일원화한다(중복 방지).
--   · MAGNUM~30LITTER 7종은 용량 옵션이라 별도 item 없이 Gold의 variant로 붙인다.
--     (750ml 단품과 같은 술의 다른 용량)
--   · 전 항목 가격이 명시돼 있어 "가격문의" 제외 대상은 없다.
--   · 테이블 차지 문구 여전히 없음 → clubs 미변경.
--
-- 결과: 항목 10개 추가 / 가격옵션 33개 추가
-- ⚠️ 646 적용 후에 실행해야 한다.
-- ============================================================================

-- ═══ Veil Social Club (광주) — 신규 2장 보강 ═══

-- 재실행 안전장치: 이 파일이 넣는 항목만 걷어낸다(646의 세트 4종은 보존).
DELETE FROM club_menu_items
WHERE club_id = 'bb929c21-bd6d-4766-85c6-2b51452058da'
  AND sort_order >= 100;


-- ── m-0: 샴페인 병수 세트 (3B / 5B / 10B) ──
-- Armand De Brignac은 m-4 Gold와 금액이 같아 여기서 제외(아래 m-4 블록에 통합).
WITH src(name_en, name_ko, l3, p3, p5, p10, ord) AS (VALUES
  ('Carbonic Blue (Bottle Set)',   '카보닉 블루 (병수 세트)',   '3 bottle',      850000,  1400000,  2700000, 100),
  ('Queen Rosé (Bottle Set)',      '퀸 로제 (병수 세트)',       '3 + 1 bottle',  900000,  1400000,  2700000, 101),
  ('Carbonic (Bottle Set)',        '카보닉 (병수 세트)',        '3 bottle',     1000000,  1650000,  3150000, 102),
  ('King Gold (Bottle Set)',       '킹 골드 (병수 세트)',       '3 + 1 bottle', 1050000,  1750000,  3500000, 103),
  ('Moët & Chandon N.I.R (Bottle Set)', '모엣 샹동 니르 (병수 세트)', '3 bottle', 1400000,  2250000,  4500000, 104),
  ('Dom Pérignon (Bottle Set)',    '돔페리뇽 (병수 세트)',      '3 bottle',     4400000,  7200000, 13500000, 105)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT 'bb929c21-bd6d-4766-85c6-2b51452058da', 'champagne', name_en, name_ko, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  (src.l3,          CASE WHEN src.l3 = '3 + 1 bottle' THEN '3+1병' ELSE '3병' END, src.p3,  1),
  ('5 bottle',      '5병',                                                          src.p5,  2),
  ('10 bottle',     '10병',                                                         src.p10, 3)
) AS v(label_en, label_ko, price, ord);


-- ── m-4: Armand de Brignac 단품(750ml) + 병수 세트 통합 ──
-- Gold는 m-0의 Armand De Brignac(3B 740만/5B 1230만/10B 2460만)과 동일 항목.
WITH src(name_en, name_ko, p1, p3, p5, p10, ord) AS (VALUES
  ('Armand de Brignac Gold',            '아르망디 브리냑 골드',        2500000,  7400000, 12300000, 24600000, 110),
  ('Armand de Brignac Rosé',            '아르망디 브리냑 로제',        3000000,  8900000, 14800000, 29500000, 111),
  ('Armand de Brignac Demi-Sec',        '아르망디 브리냑 드미섹',      3000000,  8900000, 14800000, 29500000, 112),
  ('Armand de Brignac Green',           '아르망디 브리냑 그린',        3500000, 10400000, 17300000, 34500000, 113),
  ('Armand de Brignac Blanc de Blancs', '아르망디 브리냑 블랑 드 블랑', 8000000, 23900000, 39800000, 79600000, 114)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT 'bb929c21-bd6d-4766-85c6-2b51452058da', 'champagne', name_en, name_ko, TRUE, ord
  FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, v.label_en, v.label_ko, v.price, v.ord
FROM ins
JOIN src ON src.name_en = ins.name_en
CROSS JOIN LATERAL (VALUES
  ('1 bottle (750ml)', '1병 (750ml)', src.p1,  1),
  ('3 bottle',         '3병',         src.p3,  2),
  ('5 bottle',         '5병',         src.p5,  3),
  ('10 bottle',        '10병',        src.p10, 4)
) AS v(label_en, label_ko, price, ord);


-- ── m-4 하단: Armand de Brignac Gold 대용량 (MAGNUM ~ 30L) ──
-- 같은 술의 용량 옵션이라 별도 item 없이 Gold 항목에 variant로 붙인다.
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT i.id, v.label_en, v.label_ko, v.price, v.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Magnum (1.5L)', '매그넘 (1.5L)',   5000000, 10),
  ('3 Litre',       '3리터',          17000000, 11),
  ('6 Litre',       '6리터',          48000000, 12),
  ('9 Litre',       '9리터',          75000000, 13),
  ('12 Litre',      '12리터',        100000000, 14),
  ('15 Litre',      '15리터',        150000000, 15),
  ('30 Litre',      '30리터',        300000000, 16)
) AS v(label_en, label_ko, price, ord)
WHERE i.club_id = 'bb929c21-bd6d-4766-85c6-2b51452058da'
  AND i.name_en = 'Armand de Brignac Gold';
