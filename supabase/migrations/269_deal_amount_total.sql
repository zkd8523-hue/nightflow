-- ============================================================================
-- Migration 269: 거래 금액 누적 + 금액 기반 등급 (VIP / VVIP / President)
-- 날짜: 2026-05-29
-- 설명:
--   기존 deal_count_total(횟수) 옆에 deal_amount_total(원화 합계) 컬럼 추가.
--   등급 기준을 횟수 → 금액으로 전환.
--   - VIP:       100만원+
--   - VVIP:    1,000만원+
--   - President: 5,000만원+
--   - 그 미만: 등급 없음 (라벨 비노출)
--   MD는 라벨 비노출 (UI 측에서 role 체크). 컬럼은 모든 유저에 동일하게 누적.
--
-- 데이터 소스:
--   - 깃발 visited: puzzle_offers.proposed_price (테이블 총액) → leader & MD 양쪽
--   - 경매 confirmed: auctions.current_bid (낙찰가) → winner & MD 양쪽
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deal_amount_total BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.deal_amount_total IS
  'Migration 269: 누적 거래 금액(원). 깃발 visited proposed_price + 경매 confirmed current_bid 합산. VIP/VVIP/President 등급 기준.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 트리거: 깃발 visited → 양쪽 +proposed_price
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_deal_amount_on_puzzle_visited()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id UUID;
  v_amount BIGINT;
BEGIN
  -- 멱등성: 처음 visit_marked_at이 set되고 visit_result='visited' 일 때만
  IF OLD.visit_marked_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.visit_marked_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.visit_result IS DISTINCT FROM 'visited' THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.proposed_price, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  SELECT leader_id INTO v_leader_id FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_leader_id IS NOT NULL THEN
    UPDATE users SET deal_amount_total = deal_amount_total + v_amount WHERE id = v_leader_id;
  END IF;

  IF NEW.md_id IS NOT NULL THEN
    UPDATE users SET deal_amount_total = deal_amount_total + v_amount WHERE id = NEW.md_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_deal_amount_on_puzzle_visited ON puzzle_offers;
CREATE TRIGGER trg_increment_deal_amount_on_puzzle_visited
  AFTER UPDATE ON puzzle_offers
  FOR EACH ROW
  EXECUTE FUNCTION increment_deal_amount_on_puzzle_visited();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 트리거: 경매 confirmed → 양쪽 +current_bid
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_deal_amount_on_auction_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_amount BIGINT;
BEGIN
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.current_bid, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  IF NEW.winner_id IS NOT NULL THEN
    UPDATE users SET deal_amount_total = deal_amount_total + v_amount WHERE id = NEW.winner_id;
  END IF;

  IF NEW.md_id IS NOT NULL THEN
    UPDATE users SET deal_amount_total = deal_amount_total + v_amount WHERE id = NEW.md_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_deal_amount_on_auction_confirmed ON auctions;
CREATE TRIGGER trg_increment_deal_amount_on_auction_confirmed
  AFTER UPDATE ON auctions
  FOR EACH ROW
  EXECUTE FUNCTION increment_deal_amount_on_auction_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Backfill — 기존 데이터로 deal_amount_total 초기화
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE users u SET deal_amount_total = COALESCE((
  -- 깃발 leader: visited offers의 proposed_price 합
  SELECT SUM(po.proposed_price)::BIGINT FROM puzzle_offers po
  JOIN puzzles p ON p.id = po.puzzle_id
  WHERE p.leader_id = u.id
    AND po.visit_result = 'visited'
    AND po.visit_marked_at IS NOT NULL
), 0) + COALESCE((
  -- 깃발 MD: visited offers의 proposed_price 합
  SELECT SUM(po.proposed_price)::BIGINT FROM puzzle_offers po
  WHERE po.md_id = u.id
    AND po.visit_result = 'visited'
    AND po.visit_marked_at IS NOT NULL
), 0) + COALESCE((
  -- 경매 winner: confirmed의 current_bid 합
  SELECT SUM(a.current_bid)::BIGINT FROM auctions a
  WHERE a.winner_id = u.id AND a.status = 'confirmed'
), 0) + COALESCE((
  -- 경매 MD: confirmed의 current_bid 합
  SELECT SUM(a.current_bid)::BIGINT FROM auctions a
  WHERE a.md_id = u.id AND a.status = 'confirmed'
), 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) public_user_profiles 뷰 갱신 — deal_amount_total 노출
--    CREATE OR REPLACE는 컬럼 순서/이름 변경 불가 → DROP 후 재생성
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public_user_profiles;

CREATE VIEW public_user_profiles AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.role,
  u.md_unique_slug,
  u.md_customer_grade,
  u.is_reviewer,
  u.deal_count_total,
  u.deal_amount_total,
  CASE WHEN u.role = 'md' THEN u.instagram END AS instagram,
  CASE WHEN u.role = 'md' THEN u.kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN u.role = 'md' THEN u.preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN u.role = 'md' THEN u.phone END AS phone,
  CASE WHEN u.role = 'md' THEN u.deal_count_total END AS md_deal_count
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) user_trust_scores 뷰 갱신 — deal_tier 임계값을 금액 기반으로 전환
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS user_trust_scores;

CREATE VIEW user_trust_scores AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.noshow_count,
  u.is_blocked,
  u.strike_count,
  u.deal_count_total,
  u.deal_amount_total,
  CASE
    WHEN u.deal_amount_total >= 50000000 THEN 'president'
    WHEN u.deal_amount_total >= 10000000 THEN 'vvip'
    WHEN u.deal_amount_total >= 1000000 THEN 'vip'
    ELSE NULL
  END AS deal_tier,
  COUNT(DISTINCT b.id) AS total_bids,
  COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) AS won_bids,
  ROUND(
    COALESCE(
      COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END)::NUMERIC /
      NULLIF(COUNT(DISTINCT b.id), 0) * 100,
      0
    ), 1
  ) AS win_rate,
  COALESCE(ROUND(AVG(b.bid_amount)), 0) AS avg_bid_amount,
  COUNT(DISTINCT CASE WHEN a.status = 'confirmed' THEN a.id END) AS confirmed_visits,
  COUNT(DISTINCT CASE WHEN po.visit_result = 'visited' AND po.visit_marked_at IS NOT NULL THEN po.id END) AS puzzle_visited_count,
  CASE
    WHEN u.strike_count >= 3 OR u.is_blocked THEN 'blocked'
    WHEN u.strike_count >= 1 THEN 'caution'
    WHEN COUNT(DISTINCT CASE WHEN b.status = 'won' THEN b.id END) >= 5
         AND u.strike_count = 0
    THEN 'vip'
    ELSE 'normal'
  END AS trust_level
FROM users u
LEFT JOIN bids b ON b.bidder_id = u.id
LEFT JOIN auctions a ON a.winner_id = u.id AND a.status IN ('won', 'contacted', 'confirmed')
LEFT JOIN puzzles p ON p.leader_id = u.id
LEFT JOIN puzzle_offers po ON po.puzzle_id = p.id AND po.visit_result IS NOT NULL AND po.visit_marked_at IS NOT NULL
WHERE u.role = 'user'
GROUP BY u.id, u.display_name, u.profile_image, u.noshow_count, u.is_blocked, u.strike_count, u.deal_count_total, u.deal_amount_total;

COMMENT ON VIEW user_trust_scores IS
  'Migration 269: deal_tier 임계값을 금액 기반으로 전환 (VIP 100만+ / VVIP 1000만+ / President 5000만+).';
