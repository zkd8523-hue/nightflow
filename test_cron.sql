-- 현재 시간 확인
SELECT now() AT TIME ZONE 'Asia/Seoul' as seoul_time, now() as utc_time;

-- 시작되어야 하는데 아직 scheduled 상태인 경매 확인
SELECT 
    id,
    title,
    status,
    auction_start_at AT TIME ZONE 'Asia/Seoul' as start_time_seoul,
    auction_start_at,
    now() - auction_start_at as "지난_시간"
FROM auctions 
WHERE status = 'scheduled' 
  AND auction_start_at <= now()
ORDER BY auction_start_at DESC
LIMIT 5;

-- 최근 active로 변경된 경매들
SELECT 
    id,
    title,
    status,
    updated_at AT TIME ZONE 'Asia/Seoul' as updated_seoul,
    auction_start_at AT TIME ZONE 'Asia/Seoul' as start_seoul
FROM auctions 
WHERE status = 'active'
ORDER BY updated_at DESC
LIMIT 5;
