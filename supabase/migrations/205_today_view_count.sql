-- ============================================
-- 205: 오늘 조회수 (Today View Count)
-- 목적: "오늘 N명이 봤어요" 소셜프루프 FOMO
-- 평생 누적 view_count는 백오피스용으로 유지, 노출은 today_view_count만
-- ============================================

-- "Today" 정의: KST 새벽 4시 ~ 다음날 새벽 4시 (클럽 영업일 기준)
-- (created_at - interval '4 hours') AT TIME ZONE 'Asia/Seoul' 의 date 부분

-- 1. 기존 평생 UNIQUE 제거
DROP INDEX IF EXISTS uq_auction_views_user;
DROP INDEX IF EXISTS uq_auction_views_client;

-- 2. 영업일 기준 UNIQUE: 같은 유저가 다음 영업일(다음날 새벽 4시 이후)에는 재카운트
CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_views_user_daily
  ON auction_views (
    auction_id,
    user_id,
    (((created_at AT TIME ZONE 'Asia/Seoul') - interval '4 hours')::date)
  )
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_views_client_daily
  ON auction_views (
    auction_id,
    client_id,
    (((created_at AT TIME ZONE 'Asia/Seoul') - interval '4 hours')::date)
  )
  WHERE client_id IS NOT NULL;

-- 3. 오늘 조회수 캐시 컬럼
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS today_view_count INTEGER NOT NULL DEFAULT 0;

-- 4. 트리거 함수 보강: today_view_count도 증가
CREATE OR REPLACE FUNCTION update_auction_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE auctions
       SET view_count = view_count + 1,
           today_view_count = today_view_count + 1
     WHERE id = NEW.auction_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE auctions
       SET view_count = GREATEST(view_count - 1, 0),
           today_view_count = GREATEST(today_view_count - 1, 0)
     WHERE id = OLD.auction_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 새벽 4시 KST 리셋 RPC (Edge Function에서 호출)
CREATE OR REPLACE FUNCTION reset_today_view_counts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE auctions
     SET today_view_count = 0
   WHERE today_view_count > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6. 초기 backfill: 오늘 영업일에 발생한 view를 today_view_count에 동기화
UPDATE auctions a
   SET today_view_count = sub.cnt
  FROM (
    SELECT auction_id, COUNT(*) AS cnt
      FROM auction_views
     WHERE ((created_at AT TIME ZONE 'Asia/Seoul') - interval '4 hours')::date
           = ((now() AT TIME ZONE 'Asia/Seoul') - interval '4 hours')::date
     GROUP BY auction_id
  ) sub
 WHERE a.id = sub.auction_id;
