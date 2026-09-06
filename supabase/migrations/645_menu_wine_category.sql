-- ============================================================================
-- Migration 645: 메뉴 카테고리에 wine 추가
--
-- 배경: 나머지 24곳 메뉴판을 읽다가 Hilo(강남, 위스키바)에서 병 단위 와인
--      (레드 9종·화이트 6종)이 나왔다. 기존 9개 카테고리에 wine이 없어
--      liqueur로 우겨넣으면 손님 화면의 "Liqueur" 탭에 바롤로·샤르도네가
--      섞여 나온다 — 리큐르(혼성주)와 와인은 다른 술이다.
--
-- zone 컬럼으로 'RED WINE'/'WHITE WINE'을 구분하는 방법도 있었지만, zone은
-- "층마다 가격표가 다른 클럽"(그루브&스팟 3F/2F)을 위한 축이라 의미가 겹치면
-- 나중에 그 클럽에 와인이 생겼을 때 표현이 불가능해진다.
-- ============================================================================

ALTER TABLE club_menu_items DROP CONSTRAINT IF EXISTS club_menu_items_category_check;
ALTER TABLE club_menu_items ADD CONSTRAINT club_menu_items_category_check
  CHECK (category IN (
    'champagne', 'wine', 'liqueur', 'whisky', 'tequila', 'vodka',
    'cognac', 'gin', 'rum', 'set'
  ));
