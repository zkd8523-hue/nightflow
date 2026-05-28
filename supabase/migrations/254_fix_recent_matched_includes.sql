-- Migration 254: 최근 매치 깃발의 수락된 오퍼 includes 정정
-- 기존 데이터에 "기타"로 분류된 브랜드를 실제 브랜드명으로 교체.
-- 대상: puzzle fdefb3e8-f292-44f8-812d-daba57c2c823 의 accepted_offer_id 오퍼.

UPDATE puzzle_offers
SET includes = ARRAY['모엣 5병', '샴페인 1병', '데킬라 1병']
WHERE id = (
  SELECT accepted_offer_id
  FROM puzzles
  WHERE id = 'fdefb3e8-f292-44f8-812d-daba57c2c823'
);
