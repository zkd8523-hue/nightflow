-- NightFlow 샘플 데이터
-- Supabase SQL Editor에서 실행

-- 1. 테스트용 Admin 계정 (카카오 로그인 후 이 ID로 변경 필요)
-- INSERT INTO users (id, role, kakao_id, name, phone, profile_image)
-- VALUES (
--   'YOUR_USER_ID_HERE',
--   'admin',
--   'test_kakao_id',
--   '관리자',
--   '010-0000-0000',
--   null
-- );

-- 2. 클럽 데이터
INSERT INTO clubs (id, name, address, area, thumbnail_url) VALUES
('c1111111-1111-1111-1111-111111111111', 'OCTAGON', '강남구 논현동 1234', '강남', 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=800'),
('c2222222-2222-2222-2222-222222222222', 'Club Arena', '홍대입구역 근처', '홍대', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800'),
('c3333333-3333-3333-3333-333333333333', 'Burning Sun', '이태원동 1234', '이태원', 'https://images.unsplash.com/photo-1571266028243-d220c09e8f10?w=800');

-- 3. 테스트용 MD 계정 생성 (경매 등록용)
-- 먼저 카카오 로그인 후, 아래 SQL로 본인 계정을 MD로 변경:
-- UPDATE users SET
--   role = 'md',
--   md_status = 'approved',
--   md_unique_slug = 'test-md-' || substr(md5(random()::text), 1, 4),
--   bank_name = '신한은행',
--   bank_account = '110-123-456789'
-- WHERE id = 'YOUR_USER_ID_HERE';

-- 4. 샘플 경매 데이터 (MD ID를 본인 ID로 변경 필요)
-- INSERT INTO auctions (
--   md_id,
--   club_id,
--   title,
--   event_date,
--   table_type,
--   min_people,
--   max_people,
--   includes,
--   notes,
--   original_price,
--   start_price,
--   reserve_price,
--   auction_start_at,
--   auction_end_at,
--   duration_minutes,
--   status
-- ) VALUES
-- (
--   'YOUR_MD_USER_ID',  -- 본인 MD 계정 ID
--   'c1111111-1111-1111-1111-111111111111',
--   '강남 OCTAGON VIP 테이블',
--   CURRENT_DATE + INTERVAL '1 day',
--   'VIP',
--   4,
--   8,
--   ARRAY['기본 안주', '샴페인 1병', '과일 플레이트'],
--   '드레스코드: 스마트 캐주얼',
--   300000,
--   180000,
--   180000,
--   now() + INTERVAL '10 minutes',  -- 10분 후 시작
--   now() + INTERVAL '70 minutes',  -- 70분 후 종료 (1시간 진행)
--   60,
--   'scheduled'
-- );

-- 실행 순서:
-- 1. 클럽 데이터만 먼저 실행 (위의 INSERT INTO clubs)
-- 2. 카카오 로그인 후 본인 계정을 MD로 변경
-- 3. 경매 데이터 삽입 (본인 MD ID로 수정 후)
