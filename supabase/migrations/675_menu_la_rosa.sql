-- ============================================================================
-- Migration 675: 메뉴 데이터 — La Rosa (홍대, 라틴 클럽)
--
-- 운영자가 주대표 1장 + 테이블맵 1장을 받아 전달(2026-09-30, 로컬 파일
-- nafle/주대/라로사 주대.jpg · 라로사 테이블맵.jpg). 두 사진은 clubs.drink_menu_urls /
-- floor_plan_urls에 별도로 올린다. 이 파일은 주대표를 club_menu_items로 옮긴다 —
-- 사진만 있으면 club_ids_with_menu(649)에 안 잡혀 예약 폼에서 빠진다.
--
-- 담당 MD(남색빛표범 @ss_h7160)가 club_partners에 이미 연결돼 있어서,
-- 이 파일을 적용하는 순간 bookable(has_menu AND has_md)이 참이 된다.
-- foreign_booking_agreed 플래그는 켤 필요 없다.
--
-- 주대표(BOTTLE MENU) 1장, 3구역:
--   ACCESO VIP   — 병 11종 (150,000 / 180,000)
--   ACCESO VVIP  — 병 6종 (250,000 ~ 1,000,000)
--   CHAMPAGNE    — 4종 (100,000 ~ 1,800,000)
--
-- 읽으면서 확인·판단한 것들:
--   · 가격이 천 단위 생략형이다("150." = 150,000원, "1.000." = 1,000,000원).
--     전 항목 같은 규칙.
--   · 병(Bottle) 가격만 있는 메뉴판이다 — 잔술 열 없음.
--   · "ACCESO VVIP" 구역 6종은 is_vvip = TRUE. 카테고리는 원래 장르 그대로
--     (헤네시=cognac, 패트론·돈훌리오·클라세 아술=tequila).
--     "ACCESO VIP" 구역은 일반 병이라 플래그를 세우지 않는다.
--   · CHAMPAGNE 구역은 점선으로 VIP/VVIP 구역과 분리돼 있다. 어느 구역에 속하는지
--     표시가 없어 is_vvip를 세우지 않는다(돔·아르망도 마찬가지).
--   · "X-RATED / PAMA"는 한 줄 한 가격(150,000)이다 — 가격이 선택과 무관한 택1이라
--     choices로 풀지 않고 이름에 "택1"을 명시해 단일 variant로 넣는다.
--   · "Clase Azul"은 제품명(레포사도/골드 등) 표기 없이 로고만 있다. 추측해서
--     세부명을 붙이지 않고 "Clase Azul" 그대로 둔다.
--   · "Opera"는 CHAMPAGNE 구역에 있어 champagne 카테고리로 넣는다(스파클링 와인일
--     수 있으나 메뉴판 분류를 따른다 — category CHECK에 sparkling 값도 없다).
--   · 카테고리 판단: 파이어볼·말리부·예거마이스터·X-레이티드/파마·아그와·히프노틱 =
--     liqueur, 제임슨·잭다니엘·잭다니엘 허니 = whisky, 앱솔루트 = vodka,
--     호세 쿠엘보 = tequila.
--   · 한글명은 기존 마이그레이션 표기를 따른다(제임슨, 예거마이스터, 앱솔루트,
--     모엣 샹동, 헤네시 VSOP 등).
--   · 테이블 차지·최소주문 문구가 사진에 없다 → clubs 미변경.
--
-- 결과: 항목 21개 / 가격옵션 21개
-- ============================================================================

-- 재실행 안전장치 — 이 클럽 데이터만 걷어내고 다시 넣는다(현재 이 클럽 항목은 0건).
DELETE FROM club_menu_items
WHERE club_id = '4004d7b6-b3d2-4ec4-8c42-32d82405ded0';

WITH src(category, name_en, name_ko, is_vvip, price, ord) AS (VALUES
  -- ═══ ACCESO VIP ═══
  ('liqueur', 'Fireball',                    '파이어볼',                FALSE,  150000,  1),
  ('liqueur', 'Malibu',                      '말리부',                  FALSE,  150000,  2),
  ('vodka',   'Absolut',                     '앱솔루트',                FALSE,  150000,  3),
  ('liqueur', 'Jägermeister',                '예거마이스터',            FALSE,  150000,  4),
  ('liqueur', 'X-Rated or PAMA (choose 1)',  'X-레이티드 / 파마 (택1)', FALSE,  150000,  5),
  ('whisky',  'Jameson',                     '제임슨',                  FALSE,  150000,  6),
  ('liqueur', 'Agwa',                        '아그와',                  FALSE,  150000,  7),
  ('tequila', 'Jose Cuervo',                 '호세 쿠엘보',             FALSE,  180000,  8),
  ('whisky',  'Jack Daniel''s',              '잭다니엘',                FALSE,  180000,  9),
  ('whisky',  'Jack Daniel''s Honey',        '잭다니엘 허니',           FALSE,  180000, 10),
  ('liqueur', 'Hipnotiq',                    '히프노틱',                FALSE,  180000, 11),
  -- ═══ ACCESO VVIP ═══
  ('cognac',  'Hennessy V.S.O.P',            '헤네시 VSOP',             TRUE,   280000, 12),
  ('tequila', 'Patrón Silver',               '패트론 실버',             TRUE,   280000, 13),
  ('tequila', 'Don Julio Blanco',            '돈훌리오 블랑코',         TRUE,   250000, 14),
  ('tequila', 'Don Julio Reposado',          '돈훌리오 레포사도',       TRUE,   280000, 15),
  ('tequila', 'Don Julio 1942',              '돈훌리오 1942',           TRUE,   600000, 16),
  ('tequila', 'Clase Azul',                  '클라세 아줄',             TRUE,  1000000, 17),
  -- ═══ CHAMPAGNE ═══
  ('champagne', 'Opera',                     '오페라',                  FALSE,  100000, 18),
  ('champagne', 'Moët & Chandon',            '모엣 샹동',               FALSE,  300000, 19),
  ('champagne', 'Dom Pérignon',              '돔페리뇽',                FALSE,  800000, 20),
  ('champagne', 'Armand de Brignac',         '아르망 드 브리냑',        FALSE, 1800000, 21)
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, is_vvip, sort_order)
  SELECT '4004d7b6-b3d2-4ec4-8c42-32d82405ded0', category, name_en, name_ko, is_vvip, ord
  FROM src RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;
