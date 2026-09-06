-- ============================================================================
-- Migration 647: +82(강남) · Day&night(이태원) 주대 데이터
--
-- 배경: 646에서 25곳을 넣었는데 이 두 곳이 빠졌다. 둘 다 담당 MD가 붙어 있어
--      (+82 1명, Day&night 3명) 주대만 들어오면 바로 예약 중개가 가능한
--      클럽이라 별도로 채운다. 이 마이그레이션으로 예약 가능 클럽 17 → 19곳.
--
-- 출처: 클럽 상세 페이지에 등록된 공식 가격표 이미지
--      +82 4장(CHAMPAGNE / HARD BOTTLE / KING SET / QUEEN SET)
--      Day&night 2장(SINGLE / SET)
-- 작성: 2026-09-06
--
-- 주의:
--  - zone은 전부 NULL. 두 클럽 다 층별 가격 차이가 없다(zone은 그 용도 전용).
--  - 데킬라/진/꼬냑은 스키마에 이미 있는 tequila·gin·cognac으로 넣었다.
--  - 가격은 사진에 적힌 최종가. Day&night의 취소선(할인 전) 가격은 무시했다.
--  - price_weekend는 전부 NULL — 두 사진 모두 평일/주말 구분 표기가 없다.
-- ============================================================================

-- ─────────────── +82 (강남) ───────────────
DELETE FROM club_menu_items WHERE club_id = '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4';
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('82000001-0000-4000-8000-000000000001'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'CARTES DE COUR KING', '카르트 드 쿠르 킹', NULL, false, 10),
  ('82000001-0000-4000-8000-000000000002'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'DEEP ICE', '딥 아이스', NULL, false, 20),
  ('82000001-0000-4000-8000-000000000003'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'CARBONIC BLUE', '카보닉 블루', NULL, false, 30),
  ('82000001-0000-4000-8000-000000000004'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'ILLUMI LIGHT', '일루미 라이트', NULL, false, 40),
  ('82000001-0000-4000-8000-000000000005'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'CARTES DE COUR QUEEN', '카르트 드 쿠르 퀸', NULL, false, 50),
  ('82000001-0000-4000-8000-000000000006'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'CARBONIC RED', '카보닉 레드', NULL, false, 60),
  ('82000001-0000-4000-8000-000000000007'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'SONO ELECTRIC LUMINUS EDITION', '소노 일렉트릭 루미너스 에디션', NULL, false, 70),
  ('82000001-0000-4000-8000-000000000008'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'PAUL DANGIN LUMINOUS', '폴 당장 루미너스', NULL, false, 80),
  ('82000001-0000-4000-8000-000000000009'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'ILLUMI ROSE', '일루미 로제', NULL, false, 90),
  ('82000001-0000-4000-8000-00000000000a'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'MOET CHANDON N.I.R', '모엣 샹동 니르', NULL, false, 100),
  ('82000001-0000-4000-8000-00000000000b'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'RICHARD BAVION', '리샤르 바비옹', NULL, false, 110),
  ('82000001-0000-4000-8000-00000000000c'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'PIPER RARE', '파이퍼 레어', NULL, true, 120),
  ('82000001-0000-4000-8000-00000000000d'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'DOM PERIGNON LUMINOUS', '돔 페리뇽 루미너스', NULL, true, 130),
  ('82000001-0000-4000-8000-00000000000e'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'champagne', 'ARMAND DE BRIGNAC GOLD', '아르망 디 브리냑 골드', NULL, true, 140);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('82000001-0000-4000-8000-000000000001'::uuid, '1 bottle', 350000, NULL, 1),
  ('82000001-0000-4000-8000-000000000002'::uuid, '1 bottle', 350000, NULL, 1),
  ('82000001-0000-4000-8000-000000000003'::uuid, '1 bottle', 350000, NULL, 1),
  ('82000001-0000-4000-8000-000000000004'::uuid, '1 bottle', 350000, NULL, 1),
  ('82000001-0000-4000-8000-000000000005'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000001-0000-4000-8000-000000000006'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000001-0000-4000-8000-000000000007'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000001-0000-4000-8000-000000000008'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000001-0000-4000-8000-000000000009'::uuid, '1 bottle', 500000, NULL, 1),
  ('82000001-0000-4000-8000-00000000000a'::uuid, '1 bottle', 600000, NULL, 1),
  ('82000001-0000-4000-8000-00000000000b'::uuid, '1 bottle', 1000000, NULL, 1),
  ('82000001-0000-4000-8000-00000000000c'::uuid, '1 bottle', 1200000, NULL, 1),
  ('82000001-0000-4000-8000-00000000000d'::uuid, '1 bottle', 2000000, NULL, 1),
  ('82000001-0000-4000-8000-00000000000e'::uuid, '1 bottle', 2500000, NULL, 1);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('82000002-0000-4000-8000-000000000001'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'liqueur', 'COCALERO', '코카레로', NULL, false, 210),
  ('82000002-0000-4000-8000-000000000002'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'liqueur', 'MUA', '무아', NULL, false, 220),
  ('82000002-0000-4000-8000-000000000003'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'whisky', 'SIERRA TEQUILA', '시에라 데낄라', NULL, false, 230),
  ('82000002-0000-4000-8000-000000000004'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'liqueur', 'X-RATED', '엑스레이티드', NULL, false, 240),
  ('82000002-0000-4000-8000-000000000005'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'whisky', 'CINOCORO REPOSADO', '싱코로 레포사드', NULL, false, 250),
  ('82000002-0000-4000-8000-000000000006'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'whisky', 'JOHNNIE WALKER BLUE', '조니 워커 블루', NULL, false, 260),
  ('82000002-0000-4000-8000-000000000007'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'whisky', 'DON JULIO 1942 750ML', '돈훌리오 1942 750ml', NULL, false, 270),
  ('82000002-0000-4000-8000-000000000008'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'whisky', 'LOUIS XIII', '루이 13세', NULL, true, 280);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('82000002-0000-4000-8000-000000000001'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000002-0000-4000-8000-000000000002'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000002-0000-4000-8000-000000000003'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000002-0000-4000-8000-000000000004'::uuid, '1 bottle', 400000, NULL, 1),
  ('82000002-0000-4000-8000-000000000005'::uuid, '1 bottle', 800000, NULL, 1),
  ('82000002-0000-4000-8000-000000000006'::uuid, '1 bottle', 1200000, NULL, 1),
  ('82000002-0000-4000-8000-000000000007'::uuid, '1 bottle', 1200000, NULL, 1),
  ('82000002-0000-4000-8000-000000000008'::uuid, '1 bottle', 25000000, NULL, 1);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('82000003-0000-4000-8000-000000000001'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR KING SET', '카르트 드 쿠르 킹 세트', NULL, false, 310),
  ('82000003-0000-4000-8000-000000000002'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR KING 1 BOTTLE + HARD LIQUEUR 2 BOTTLE', '카르트 드 쿠르 킹 1B + 하드 리큐르 2B', NULL, false, 320),
  ('82000003-0000-4000-8000-000000000003'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR KING 2 BOTTLE + HARD LIQUEUR 1 BOTTLE', '카르트 드 쿠르 킹 2B + 하드 리큐르 1B', NULL, false, 330);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('82000003-0000-4000-8000-000000000001'::uuid, '3 bottle', 1100000, NULL, 1),
  ('82000003-0000-4000-8000-000000000001'::uuid, '5 bottle', 1750000, NULL, 2),
  ('82000003-0000-4000-8000-000000000001'::uuid, '10 bottle', 3500000, NULL, 3),
  ('82000003-0000-4000-8000-000000000002'::uuid, '3 bottle set', 1200000, NULL, 1),
  ('82000003-0000-4000-8000-000000000003'::uuid, '3 bottle set', 1150000, NULL, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('82000003-0000-4000-8000-000000000002'::uuid, 1, 'X-RATED', 0, 1),
  ('82000003-0000-4000-8000-000000000002'::uuid, 1, 'COCALERO', 0, 2),
  ('82000003-0000-4000-8000-000000000002'::uuid, 1, 'MUA', 0, 3),
  ('82000003-0000-4000-8000-000000000002'::uuid, 1, 'SIERRA TEQUILA', 0, 4),
  ('82000003-0000-4000-8000-000000000002'::uuid, 2, 'X-RATED', 0, 1),
  ('82000003-0000-4000-8000-000000000002'::uuid, 2, 'COCALERO', 0, 2),
  ('82000003-0000-4000-8000-000000000002'::uuid, 2, 'MUA', 0, 3),
  ('82000003-0000-4000-8000-000000000002'::uuid, 2, 'SIERRA TEQUILA', 0, 4),
  ('82000003-0000-4000-8000-000000000003'::uuid, 1, 'X-RATED', 0, 1),
  ('82000003-0000-4000-8000-000000000003'::uuid, 1, 'COCALERO', 0, 2),
  ('82000003-0000-4000-8000-000000000003'::uuid, 1, 'MUA', 0, 3),
  ('82000003-0000-4000-8000-000000000003'::uuid, 1, 'SIERRA TEQUILA', 0, 4);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('82000004-0000-4000-8000-000000000001'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR QUEEN SET', '카르트 드 쿠르 퀸 세트', NULL, false, 410),
  ('82000004-0000-4000-8000-000000000002'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR QUEEN 1 BOTTLE + HARD LIQUEUR 2 BOTTLE', '카르트 드 쿠르 퀸 1B + 하드 리큐르 2B', NULL, false, 420),
  ('82000004-0000-4000-8000-000000000003'::uuid, '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, 'set', 'CARTES DE COUR QUEEN 2 BOTTLE + HARD LIQUEUR 1 BOTTLE', '카르트 드 쿠르 퀸 2B + 하드 리큐르 1B', NULL, false, 430);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('82000004-0000-4000-8000-000000000001'::uuid, '3 bottle', 1200000, NULL, 1),
  ('82000004-0000-4000-8000-000000000001'::uuid, '5 bottle', 2000000, NULL, 2),
  ('82000004-0000-4000-8000-000000000001'::uuid, '10 bottle', 4000000, NULL, 3),
  ('82000004-0000-4000-8000-000000000002'::uuid, '3 bottle set', 1200000, NULL, 1),
  ('82000004-0000-4000-8000-000000000003'::uuid, '3 bottle set', 1200000, NULL, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('82000004-0000-4000-8000-000000000002'::uuid, 1, 'X-RATED', 0, 1),
  ('82000004-0000-4000-8000-000000000002'::uuid, 1, 'COCALERO', 0, 2),
  ('82000004-0000-4000-8000-000000000002'::uuid, 1, 'MUA', 0, 3),
  ('82000004-0000-4000-8000-000000000002'::uuid, 1, 'SIERRA TEQUILA', 0, 4),
  ('82000004-0000-4000-8000-000000000002'::uuid, 2, 'X-RATED', 0, 1),
  ('82000004-0000-4000-8000-000000000002'::uuid, 2, 'COCALERO', 0, 2),
  ('82000004-0000-4000-8000-000000000002'::uuid, 2, 'MUA', 0, 3),
  ('82000004-0000-4000-8000-000000000002'::uuid, 2, 'SIERRA TEQUILA', 0, 4),
  ('82000004-0000-4000-8000-000000000003'::uuid, 1, 'X-RATED', 0, 1),
  ('82000004-0000-4000-8000-000000000003'::uuid, 1, 'COCALERO', 0, 2),
  ('82000004-0000-4000-8000-000000000003'::uuid, 1, 'MUA', 0, 3),
  ('82000004-0000-4000-8000-000000000003'::uuid, 1, 'SIERRA TEQUILA', 0, 4);

-- ─────────────── Day&night (이태원) ───────────────
DELETE FROM club_menu_items WHERE club_id = '103400ee-b647-428f-ae76-07131a720dc6';
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('da000001-0000-4000-8000-000000000001'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'tequila', 'SIERRA',                NULL, NULL, false, 10),
  ('da000001-0000-4000-8000-000000000002'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'JAMESON',               NULL, NULL, false, 20),
  ('da000001-0000-4000-8000-000000000003'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'liqueur', 'MALIBU',                NULL, NULL, false, 30),
  ('da000001-0000-4000-8000-000000000004'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'gin',     'BEEFEATER',             NULL, NULL, false, 40),
  ('da000001-0000-4000-8000-000000000005'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'vodka',   'ABSOLUT',               NULL, NULL, false, 50),
  ('da000001-0000-4000-8000-000000000006'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'liqueur', 'X-RATED',               NULL, NULL, false, 60),
  ('da000001-0000-4000-8000-000000000007'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'FIREBALL',              NULL, NULL, false, 70),
  ('da000001-0000-4000-8000-000000000008'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'liqueur', 'ANGELS PEACH',          NULL, NULL, false, 80),
  ('da000001-0000-4000-8000-000000000009'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'tequila', 'OLMECA ALTOS',          NULL, NULL, false, 90),
  ('da000001-0000-4000-8000-00000000000a'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'liqueur', 'AGWA',                  NULL, NULL, false, 100),
  ('da000001-0000-4000-8000-00000000000b'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'liqueur', 'HPNOTIQ',               NULL, NULL, false, 110),
  ('da000001-0000-4000-8000-00000000000c'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'vodka',   'BELVEDERE PURE',        NULL, NULL, false, 120),
  ('da000001-0000-4000-8000-00000000000d'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'BALLANTINE''S 10Y',     NULL, NULL, false, 130),
  ('da000001-0000-4000-8000-00000000000e'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'JACK DANIEL''S',        NULL, NULL, false, 140),
  ('da000001-0000-4000-8000-00000000000f'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'JACK DANIEL''S APPLE',  NULL, NULL, false, 150),
  ('da000001-0000-4000-8000-000000000010'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'tequila', 'PATRON SILVER',         NULL, NULL, false, 160),
  ('da000001-0000-4000-8000-000000000011'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'MACALLAN 12Y',          NULL, NULL, false, 170),
  ('da000001-0000-4000-8000-000000000012'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'cognac',  'HENNESSY',              NULL, NULL, false, 180),
  ('da000001-0000-4000-8000-000000000013'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'GLENDRONACH 12Y',       NULL, NULL, false, 190),
  ('da000001-0000-4000-8000-000000000014'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'tequila', 'CATRINA BLANCO',        NULL, NULL, false, 200),
  ('da000001-0000-4000-8000-000000000015'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'JOHNNIE BLUE',          NULL, NULL, true,  210),
  ('da000001-0000-4000-8000-000000000016'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'whisky',  'ROYAL SALUTE 21Y',      NULL, NULL, true,  220),
  ('da000001-0000-4000-8000-000000000017'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'tequila', 'CLASE AZUL REPOSADO',   NULL, NULL, true,  230);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('da000001-0000-4000-8000-000000000001'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000002'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000003'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000004'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000005'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000006'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000007'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000008'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000009'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000a'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000b'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000c'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000d'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000e'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-00000000000f'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000010'::uuid, '1 bottle', 350000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000011'::uuid, '1 bottle', 350000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000012'::uuid, '1 bottle', 350000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000013'::uuid, '1 bottle', 350000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000014'::uuid, '1 bottle', 350000,  NULL, 1),
  ('da000001-0000-4000-8000-000000000015'::uuid, '1 bottle', 1000000, NULL, 1),
  ('da000001-0000-4000-8000-000000000016'::uuid, '1 bottle', 1000000, NULL, 1),
  ('da000001-0000-4000-8000-000000000017'::uuid, '1 bottle', 1000000, NULL, 1);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('da000002-0000-4000-8000-000000000001'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'BLANC FOUSSY',           NULL, NULL, false, 310),
  ('da000002-0000-4000-8000-000000000002'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'DIABLO',                 NULL, NULL, false, 320),
  ('da000002-0000-4000-8000-000000000003'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'LUC BELAIRE',            NULL, NULL, false, 330),
  ('da000002-0000-4000-8000-000000000004'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'G.H.MUMM',               NULL, NULL, false, 340),
  ('da000002-0000-4000-8000-000000000005'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'MOET',                   NULL, NULL, false, 350),
  ('da000002-0000-4000-8000-000000000006'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'MOET NIRO',              NULL, NULL, false, 360),
  ('da000002-0000-4000-8000-000000000007'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'DOM PERIGNON',           NULL, NULL, true,  370),
  ('da000002-0000-4000-8000-000000000008'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'ARMAND DE BRIGNAC BRUT', NULL, NULL, true,  380);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('da000002-0000-4000-8000-000000000001'::uuid, '1 bottle', 100000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000002'::uuid, '1 bottle', 200000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000003'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000004'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000005'::uuid, '1 bottle', 250000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000006'::uuid, '1 bottle', 300000,  NULL, 1),
  ('da000002-0000-4000-8000-000000000007'::uuid, '1 bottle', 1000000, NULL, 1),
  ('da000002-0000-4000-8000-000000000008'::uuid, '1 bottle', 2000000, NULL, 1);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000001'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'BEGINNER SET A', NULL, NULL, false, 410),
  ('da000003-0000-4000-8000-000000000002'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'BEGINNER SET B', NULL, NULL, false, 420),
  ('da000003-0000-4000-8000-000000000003'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'VODKA SET',      NULL, NULL, false, 430),
  ('da000003-0000-4000-8000-000000000004'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'TEQUILA SET',    NULL, NULL, false, 440),
  ('da000003-0000-4000-8000-000000000005'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'LIQUEUR SET',    NULL, NULL, false, 450),
  ('da000003-0000-4000-8000-000000000006'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'VIP SET A',      NULL, NULL, true,  460),
  ('da000003-0000-4000-8000-000000000007'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'VIP SET B',      NULL, NULL, true,  470);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000001'::uuid, 'Set', 300000,  NULL, 1),
  ('da000003-0000-4000-8000-000000000002'::uuid, 'Set', 300000,  NULL, 1),
  ('da000003-0000-4000-8000-000000000003'::uuid, 'Set', 600000,  NULL, 1),
  ('da000003-0000-4000-8000-000000000004'::uuid, 'Set', 600000,  NULL, 1),
  ('da000003-0000-4000-8000-000000000005'::uuid, 'Set', 600000,  NULL, 1),
  ('da000003-0000-4000-8000-000000000006'::uuid, 'Set', 1000000, NULL, 1),
  ('da000003-0000-4000-8000-000000000007'::uuid, 'Set', 1500000, NULL, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000001'::uuid, 1, 'SIERRA',        0, 1),
  ('da000003-0000-4000-8000-000000000001'::uuid, 1, 'JAMESON',       0, 2),
  ('da000003-0000-4000-8000-000000000001'::uuid, 1, 'MALIBU',        0, 3),
  ('da000003-0000-4000-8000-000000000001'::uuid, 1, 'X-RATED',       0, 4),
  ('da000003-0000-4000-8000-000000000001'::uuid, 2, 'BLANC FOUSSY',  0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000002'::uuid, 1, 'AGWA',           0, 1),
  ('da000003-0000-4000-8000-000000000002'::uuid, 1, 'HPNOTIQ',        0, 2),
  ('da000003-0000-4000-8000-000000000002'::uuid, 1, 'JACK DANIEL''S', 0, 3),
  ('da000003-0000-4000-8000-000000000002'::uuid, 2, '365 BRUT',       0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000003'::uuid, 1, 'ABSOLUT',        0, 1),
  ('da000003-0000-4000-8000-000000000003'::uuid, 2, 'BELVEDERE PURE', 0, 1),
  ('da000003-0000-4000-8000-000000000003'::uuid, 3, 'DIABLO',         0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000004'::uuid, 1, 'SIERRA',       0, 1),
  ('da000003-0000-4000-8000-000000000004'::uuid, 2, 'OLMECA ALTOS', 0, 1),
  ('da000003-0000-4000-8000-000000000004'::uuid, 3, 'DIABLO',       0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000005'::uuid, 1, 'X-RATED', 0, 1),
  ('da000003-0000-4000-8000-000000000005'::uuid, 2, 'HPNOTIQ', 0, 1),
  ('da000003-0000-4000-8000-000000000005'::uuid, 3, 'DIABLO',  0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000006'::uuid, 1, 'PATRON SILVER',      0, 1),
  ('da000003-0000-4000-8000-000000000006'::uuid, 1, 'MACALLAN 12Y',       0, 2),
  ('da000003-0000-4000-8000-000000000006'::uuid, 1, 'HENNESSY',           0, 3),
  ('da000003-0000-4000-8000-000000000006'::uuid, 1, 'GLENDRONACH 12Y',    0, 4),
  ('da000003-0000-4000-8000-000000000006'::uuid, 2, 'SIERRA x1',          0, 1),
  ('da000003-0000-4000-8000-000000000006'::uuid, 3, 'LUC BELAIRE x2',     0, 1);
INSERT INTO club_menu_choices (item_id, slot_no, name_en, extra_price, sort_order) VALUES
  ('da000003-0000-4000-8000-000000000007'::uuid, 1, 'JOHNNIE BLUE',        0, 1),
  ('da000003-0000-4000-8000-000000000007'::uuid, 1, 'ROYAL SALUTE 21Y',    0, 2),
  ('da000003-0000-4000-8000-000000000007'::uuid, 1, 'CLASE AZUL REPOSADO', 0, 3),
  ('da000003-0000-4000-8000-000000000007'::uuid, 2, 'LUC BELAIRE x2',      0, 1);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('da000004-0000-4000-8000-000000000001'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - BLANC FOUSSY',        NULL, NULL, false, 510),
  ('da000004-0000-4000-8000-000000000002'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - LUC BELAIRE LUXE',    NULL, NULL, false, 520),
  ('da000004-0000-4000-8000-000000000003'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - G.H.MUMM',            NULL, NULL, false, 530),
  ('da000004-0000-4000-8000-000000000004'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - MOET CHANDON',        NULL, NULL, false, 540),
  ('da000004-0000-4000-8000-000000000005'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - MOET CHANDON NIRO',   NULL, NULL, false, 550),
  ('da000004-0000-4000-8000-000000000006'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - DOM PERIGNON LUMINOUS', NULL, NULL, true, 560),
  ('da000004-0000-4000-8000-000000000007'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'set', 'CHAMPAGNE SET - ARMAND DE BRIGNAC',   NULL, NULL, true,  570);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('da000004-0000-4000-8000-000000000001'::uuid, '3 bottles',  300000,  NULL, 1),
  ('da000004-0000-4000-8000-000000000001'::uuid, '5 bottles',  500000,  NULL, 2),
  ('da000004-0000-4000-8000-000000000001'::uuid, '10 bottles', 1000000, NULL, 3),
  ('da000004-0000-4000-8000-000000000002'::uuid, '2 bottles',  500000,  NULL, 1),
  ('da000004-0000-4000-8000-000000000002'::uuid, '3 bottles',  700000,  NULL, 2),
  ('da000004-0000-4000-8000-000000000002'::uuid, '5 bottles',  1150000, NULL, 3),
  ('da000004-0000-4000-8000-000000000003'::uuid, '2 bottles',  500000,  NULL, 1),
  ('da000004-0000-4000-8000-000000000003'::uuid, '3 bottles',  700000,  NULL, 2),
  ('da000004-0000-4000-8000-000000000003'::uuid, '5 bottles',  1150000, NULL, 3),
  ('da000004-0000-4000-8000-000000000004'::uuid, '2 bottles',  500000,  NULL, 1),
  ('da000004-0000-4000-8000-000000000004'::uuid, '3 bottles',  700000,  NULL, 2),
  ('da000004-0000-4000-8000-000000000004'::uuid, '5 bottles',  1150000, NULL, 3),
  ('da000004-0000-4000-8000-000000000005'::uuid, '2 bottles',  600000,  NULL, 1),
  ('da000004-0000-4000-8000-000000000005'::uuid, '3 bottles',  850000,  NULL, 2),
  ('da000004-0000-4000-8000-000000000005'::uuid, '5 bottles',  1400000, NULL, 3),
  ('da000004-0000-4000-8000-000000000006'::uuid, '2 bottles',  2000000, NULL, 1),
  ('da000004-0000-4000-8000-000000000006'::uuid, '3 bottles',  2900000, NULL, 2),
  ('da000004-0000-4000-8000-000000000006'::uuid, '5 bottles',  4800000, NULL, 3),
  ('da000004-0000-4000-8000-000000000007'::uuid, '2 bottles',  4000000, NULL, 1),
  ('da000004-0000-4000-8000-000000000007'::uuid, '3 bottles',  5900000, NULL, 2),
  ('da000004-0000-4000-8000-000000000007'::uuid, '5 bottles',  9800000, NULL, 3);
INSERT INTO club_menu_items (id, club_id, category, name_en, name_ko, zone, is_vvip, sort_order) VALUES
  ('da000005-0000-4000-8000-000000000001'::uuid, '103400ee-b647-428f-ae76-07131a720dc6'::uuid, 'champagne', 'EXTRA CHAMPAIGNE 365 BRUT', NULL, NULL, false, 900);
INSERT INTO club_menu_variants (item_id, label_en, price, price_weekend, sort_order) VALUES
  ('da000005-0000-4000-8000-000000000001'::uuid, 'Add-on', 500000, NULL, 1);
