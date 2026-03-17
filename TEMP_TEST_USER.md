# 임시 테스트 계정 생성 (OAuth 대신)

카카오 OAuth 설정 문제로 인해 임시로 테스트 계정을 DB에 직접 생성합니다.

## Supabase SQL Editor에서 실행

```sql
-- 1. 테스트 유저 생성 (일반 유저)
INSERT INTO users (id, role, kakao_id, name, phone, profile_image)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'user',
  'test_user',
  '테스트유저',
  '010-1111-1111',
  null
);

-- 2. 테스트 MD 생성
INSERT INTO users (id, role, kakao_id, name, phone, profile_image, md_status, md_unique_slug, bank_name, bank_account)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'md',
  'test_md',
  '테스트MD',
  '010-2222-2222',
  null,
  'approved',
  'test-md-1234',
  '신한은행',
  '110-123-456789'
);

-- 3. 샘플 경매 생성
INSERT INTO auctions (
  md_id,
  club_id,
  title,
  event_date,
  table_type,
  min_people,
  max_people,
  includes,
  notes,
  original_price,
  start_price,
  reserve_price,
  auction_start_at,
  auction_end_at,
  duration_minutes,
  status
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'c1111111-1111-1111-1111-111111111111',
  '강남 OCTAGON VIP 테이블',
  CURRENT_DATE + INTERVAL '1 day',
  'VIP',
  4,
  8,
  ARRAY['기본 안주', '샴페인 1병', '과일 플레이트'],
  '드레스코드: 스마트 캐주얼',
  300000,
  180000,
  180000,
  now(),
  now() + INTERVAL '1 hour',
  60,
  'active'
);
```

## 테스트 방법

OAuth 없이 개발 진행 후, 나중에 카카오 OAuth를 다시 설정하면 됩니다.

당장은 **경매 상세 페이지**를 직접 URL로 접속해서 테스트할 수 있습니다.
