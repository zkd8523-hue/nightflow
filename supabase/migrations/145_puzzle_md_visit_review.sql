-- ============================================================================
-- Migration 144: 깃발(Puzzle) MD 방문 OX 평가 + Admin Strike 큐
-- 날짜: 2026-05-09
-- 설명:
--   깃발 모드의 핵심 가치인 "유저 수질 검증"을 위해 MD가 방문 결과를 OX로
--   평가하고, admin이 검토 후 노쇼에 대한 strike를 적용하는 흐름을 추가.
--
-- 변경:
--   1) puzzle_offers: visit_result/visit_marked_at/strike_applied_at/strike_applied_by 컬럼
--   2) RPC: mark_puzzle_visit() — MD가 본인 accepted 오퍼에 대해 1회 OX 마킹
--   3) RPC: admin_apply_puzzle_strike() — admin이 검토 후 leader에게 strike
--   4) user_trust_scores 뷰 확장: puzzle_visited_count / puzzle_noshow_count
-- ============================================================================

-- 1) puzzle_offers 컬럼 추가
ALTER TABLE puzzle_offers
  ADD COLUMN IF NOT EXISTS visit_result TEXT
    CHECK (visit_result IN ('visited', 'noshow')),
  ADD COLUMN IF NOT EXISTS visit_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS strike_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS strike_applied_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_puzzle_offers_noshow_queue
  ON puzzle_offers(visit_marked_at)
  WHERE visit_result = 'noshow' AND strike_applied_at IS NULL;

-- 2) MD가 본인 accepted 오퍼에 대해 OX 마킹 (1회만, 수정 불가)
CREATE OR REPLACE FUNCTION mark_puzzle_visit(
  p_offer_id UUID,
  p_result TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
BEGIN
  -- 결과값 검증
  IF p_result NOT IN ('visited', 'noshow') THEN
    RETURN jsonb_build_object('success', false, 'error', '결과는 visited 또는 noshow여야 합니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 본인 오퍼만
  IF v_offer.md_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 오퍼만 평가할 수 있습니다');
  END IF;

  -- accepted 상태만
  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 평가할 수 있습니다');
  END IF;

  -- 1회만 (수정 불가)
  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 평가가 완료된 오퍼입니다');
  END IF;

  -- event_date 지난 후만
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.event_date IS NULL OR v_puzzle.event_date >= CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', '이벤트 날짜가 지난 후에만 평가할 수 있습니다');
  END IF;

  UPDATE puzzle_offers
  SET visit_result = p_result,
      visit_marked_at = now(),
      updated_at = now()
  WHERE id = p_offer_id;

  RETURN jsonb_build_object('success', true, 'result', p_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_puzzle_visit(UUID, TEXT) IS
  'Migration 144: MD가 본인 accepted 오퍼에 대해 방문/노쇼 OX 마킹. 1회만 가능, 수정 불가. event_date 이후만.';

-- 3) Admin 검토 후 leader에게 strike 적용
CREATE OR REPLACE FUNCTION admin_apply_puzzle_strike(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_admin users%ROWTYPE;
  v_offer puzzle_offers%ROWTYPE;
  v_leader_id UUID;
  v_strike_result JSON;
BEGIN
  -- admin 검증
  SELECT * INTO v_admin FROM users WHERE id = auth.uid();
  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 호출할 수 있습니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 노쇼이고 아직 strike 미적용
  IF v_offer.visit_result != 'noshow' OR v_offer.strike_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '노쇼 미처리 오퍼만 strike 적용 가능합니다');
  END IF;

  -- 방장 ID 조회
  SELECT leader_id INTO v_leader_id FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_leader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '방장을 찾을 수 없습니다');
  END IF;

  -- 기존 apply_noshow_strike 재사용
  v_strike_result := apply_noshow_strike(v_leader_id);

  -- 처리 마킹
  UPDATE puzzle_offers
  SET strike_applied_at = now(),
      strike_applied_by = auth.uid(),
      updated_at = now()
  WHERE id = p_offer_id;

  RETURN jsonb_build_object(
    'success', true,
    'leader_id', v_leader_id,
    'strike', v_strike_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_apply_puzzle_strike(UUID) IS
  'Migration 144: Admin이 노쇼로 마킹된 puzzle_offer를 검토하고 방장(leader)에게 strike 적용.';

-- 4) user_trust_scores 뷰 확장 — 깃발(leader 기준) 통계 추가
CREATE OR REPLACE VIEW user_trust_scores AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.noshow_count,
  u.is_blocked,
  u.strike_count,
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
  -- 깃발 통계 (leader 기준 — 방장이 본인 깃발의 방문 결과)
  COUNT(DISTINCT CASE WHEN po.visit_result = 'visited' THEN po.id END) AS puzzle_visited_count,
  COUNT(DISTINCT CASE WHEN po.visit_result = 'noshow' THEN po.id END) AS puzzle_noshow_count,
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
LEFT JOIN puzzle_offers po ON po.puzzle_id = p.id AND po.visit_result IS NOT NULL
WHERE u.role = 'user'
GROUP BY u.id, u.display_name, u.profile_image, u.noshow_count, u.is_blocked, u.strike_count;

COMMENT ON VIEW user_trust_scores IS
  'Migration 144: 깃발 leader 기준 puzzle_visited_count/puzzle_noshow_count 추가. trust_level은 strike_count 기반 그대로.';
