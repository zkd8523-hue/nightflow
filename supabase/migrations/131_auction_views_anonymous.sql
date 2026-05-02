-- 비로그인 조회수 추적: localStorage UUID 기반
-- - user_id NULLABLE
-- - client_id 컬럼 추가
-- - partial unique index 2개 (로그인 / 비로그인 분리)
-- - RLS: 비로그인도 INSERT 허용

-- 1. user_id NULLABLE
ALTER TABLE auction_views ALTER COLUMN user_id DROP NOT NULL;

-- 2. client_id 컬럼 추가
ALTER TABLE auction_views ADD COLUMN IF NOT EXISTS client_id TEXT;

-- 3. 기존 unique 제거 (있으면)
ALTER TABLE auction_views DROP CONSTRAINT IF EXISTS auction_views_auction_id_user_id_key;

-- 4. 새 partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_views_user
  ON auction_views (auction_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auction_views_client
  ON auction_views (auction_id, client_id) WHERE client_id IS NOT NULL;

-- 5. RLS INSERT 정책 보완: 비로그인도 INSERT 허용
DROP POLICY IF EXISTS "Users can insert own view" ON auction_views;

CREATE POLICY "Anyone can insert view" ON auction_views
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND user_id IS NULL AND client_id IS NOT NULL)
  );
