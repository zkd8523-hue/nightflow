-- 광고용 데모 깃발 + 4개 MD 제안 시드
-- 사용처: "쏟아지는 MD 제안 비교" 광고 스토리 캡처용
-- 실행 후 캡처 → 즉시 cleanup_demo_puzzle.sql 실행 권장

DO $$
DECLARE
  v_leader_id UUID := 'c1799685-bbc5-418e-a013-171581aa53cd'; -- 기존 테스트유저 (홍대파리)
  v_md1 UUID := '758c0ce7-ed5d-4b18-8946-83bb0c09e35b'; -- 테스트MD1
  v_md2 UUID := 'ae36e150-2a8f-4fe7-8e5e-e3a02c94271e'; -- 테스트MD2
  v_md3 UUID := '6f152e52-dcad-4363-a36c-88f7c70ecce5'; -- 홍대지까미
  v_md4 UUID := '52e968c6-111e-4fb9-a2c2-f3deff66ce89'; -- 기깔나는
  v_puzzle_id UUID := 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
  v_club_a UUID := 'c1111111-1111-1111-1111-111111111111'; -- OCTAGON
BEGIN
  -- 1. 데모 깃발 생성
  INSERT INTO puzzles (
    id, leader_id, area, event_date, kakao_open_chat_url,
    budget_per_person, total_budget, target_count, current_count,
    status, expires_at, notes
  ) VALUES (
    v_puzzle_id, v_leader_id, '강남', '2026-05-10',
    'https://open.kakao.com/o/demo_seed',
    150000, 600000, 4, 4,
    'open', '2026-05-10 21:00:00+09',
    '토욜일 강남, MD님들 제안 기다려요'
  );

  -- 2. 방장 멤버 등록 (current_count = 4 만족용으로 guest_count 3)
  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
  VALUES (v_puzzle_id, v_leader_id, 3);

  -- 3. 4개 MD 제안 (가격 600,000원 통일, 패키지 차별)
  INSERT INTO puzzle_offers (
    puzzle_id, md_id, club_id, table_type, proposed_price,
    includes, comment, created_at
  ) VALUES
  -- MD1: 1티어 클럽 명성으로 어필
  (v_puzzle_id, v_md1, v_club_a, 'VIP', 600000,
   ARRAY['하드 1병', '믹서 무제한', '과일 플레이트'],
   '강남 1티어 클럽 메인 자리 가능합니다',
   now() - interval '15 minutes'),

  -- MD2: 보너스 서비스로 어필
  (v_puzzle_id, v_md2, v_club_a, 'Standard', 600000,
   ARRAY['하드 1병', '서비스 1병 추가', '믹서 무제한'],
   '오랜만이시라 서비스 1병 더 드려요',
   now() - interval '1 hour'),

  -- MD3: 바틀 수로 어필
  (v_puzzle_id, v_md3, v_club_a, 'Standard', 600000,
   ARRAY['하드 2병', '믹서 무제한', '과일 플레이트'],
   '바틀 2병 가성비 최고입니다',
   now() - interval '3 hours'),

  -- MD4: 1티어 + 입장 메리트
  (v_puzzle_id, v_md4, v_club_a, 'VIP', 600000,
   ARRAY['하드 1병', '시그니처 칵테일', 'VIP 입장 라인'],
   '대기 없이 VIP 라인으로 모십니다',
   now() - interval '5 hours');

  RAISE NOTICE 'Demo puzzle seeded: %', v_puzzle_id;
  RAISE NOTICE 'View at: /puzzles/%', v_puzzle_id;
END $$;
