-- ============================================================================
-- Migration 147: 깃발 거래완료를 MD 일방 마킹으로 단순화
-- 날짜: 2026-05-11
-- 설명:
--   145/146에서 도입한 깃발 노쇼 신고 + 양방향 confirm + 7일 cron 흐름 폐기.
--   NightFlow 역할은 "매칭 + 연락처 교환까지"이고, 그 이후 분쟁은 시스템 책임 밖.
--   거래완료 마킹은 MD only로 단순화 — MD는 검증된 파트너이고 자기 등급(deal_count)
--   챙기려는 인센티브로 자연스럽게 누적 동력 작동.
--
-- 변경:
--   - 145/146 일부 RPC 제거: mark_puzzle_visit, admin_apply_puzzle_strike,
--     request_puzzle_visit_confirm, confirm_puzzle_visit, auto_confirm_expired_visits
--   - 신규 RPC: mark_puzzle_visited(p_offer_id) — MD 본인 + accepted + event_date 지난 후만
--   - notify_puzzle_visit_pending RPC: leader 알림 라인 제거 (MD에게만 OX 요청)
--   - user_trust_scores 뷰: puzzle_noshow_count 컬럼 제거
--
-- 보존 (롤백 안전성):
--   - puzzle_offers 모든 컬럼 (visit_result, visit_marked_at, visit_requested_by/at,
--     strike_applied_at/by) 그대로
--   - visit_result CHECK 제약 (visited|noshow) 그대로
--   - 트리거 increment_deal_count_on_puzzle_visited 그대로
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 사용 안 하는 RPC 제거
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mark_puzzle_visit(UUID, TEXT);
DROP FUNCTION IF EXISTS admin_apply_puzzle_strike(UUID);
DROP FUNCTION IF EXISTS request_puzzle_visit_confirm(UUID, TEXT);
DROP FUNCTION IF EXISTS confirm_puzzle_visit(UUID, TEXT);
DROP FUNCTION IF EXISTS auto_confirm_expired_visits();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 신규 RPC: mark_puzzle_visited (MD 일방 마킹, 즉시 확정)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_puzzle_visited(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 권한: MD 본인만
  IF v_caller != v_offer.md_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 거래완료를 마킹할 수 있습니다');
  END IF;

  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 마킹할 수 있습니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마킹된 거래입니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.event_date IS NULL OR v_puzzle.event_date >= CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', '이벤트 날짜가 지난 후에만 마킹할 수 있습니다');
  END IF;

  -- 즉시 확정: visit_marked_at 설정 → 트리거가 leader & MD deal_count_total +1
  UPDATE puzzle_offers
  SET visit_result = 'visited',
      visit_marked_at = now(),
      visit_requested_by = v_caller,
      visit_requested_at = now(),
      updated_at = now()
  WHERE id = p_offer_id;

  -- leader에게 알림 (MD 일방 마킹이므로 통보 성격)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_visit_confirmed',
    '거래 확정됨',
    'MD가 거래를 확정했습니다. 거래 카운트가 +1 적립되었습니다.',
    '/flags/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_puzzle_visited(UUID) IS
  'Migration 147: MD 일방 거래완료 마킹. event_date 후 + accepted offer + 본인 MD만. 즉시 확정 → 양쪽 deal_count +1.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) notify_puzzle_visit_pending 재정의 — MD에게만 알림
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_puzzle_visit_pending()
RETURNS JSONB AS $$
DECLARE
  v_count INTEGER := 0;
  v_offer RECORD;
BEGIN
  FOR v_offer IN
    SELECT po.id, po.md_id, po.proposed_price,
           p.id AS puzzle_id, p.area, p.event_date,
           COALESCE(u.display_name, u.name, '방장') AS leader_name
    FROM puzzle_offers po
    JOIN puzzles p ON p.id = po.puzzle_id
    JOIN users u ON u.id = p.leader_id
    WHERE po.status = 'accepted'
      AND po.visit_marked_at IS NULL
      AND p.event_date = CURRENT_DATE - INTERVAL '1 day'
  LOOP
    -- MD에게만 OX 요청 (leader 측 알림 제거)
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.md_id,
      'puzzle_visit_pending',
      '거래완료 마킹 필요',
      '어제 ' || v_offer.area || ' 깃발(방장 ' || v_offer.leader_name || ') 거래 완료되셨나요? 거래완료를 눌러주세요.',
      '/md/dashboard'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('notified', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_puzzle_visit_pending() IS
  'Migration 147: event_date+1일 시점, MD에게만 거래완료 마킹 요청 알림. leader 측 알림 라인 제거.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) user_trust_scores 뷰 — puzzle_noshow_count 제거
--    PostgreSQL은 CREATE OR REPLACE VIEW로 컬럼 제거 불가 → DROP 후 CREATE
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
  CASE
    WHEN u.deal_count_total >= 10 THEN 'diamond'
    WHEN u.deal_count_total >= 3 THEN 'gold'
    WHEN u.deal_count_total >= 1 THEN 'silver'
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
  -- puzzle_noshow_count 제거 (Migration 147)
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
GROUP BY u.id, u.display_name, u.profile_image, u.noshow_count, u.is_blocked, u.strike_count, u.deal_count_total;

COMMENT ON VIEW user_trust_scores IS
  'Migration 147: puzzle_noshow_count 제거 (깃발 노쇼 시스템 폐기). 거래완료 카운트만 유지.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) 인덱스 정리
-- ─────────────────────────────────────────────────────────────────────────────
-- 146에서 만든 양방향 confirm 대기 큐 인덱스 — 이제 의미 없음 (모든 마킹이 즉시)
DROP INDEX IF EXISTS idx_puzzle_offers_pending_confirm;

-- 145에서 만든 admin 큐 인덱스 — 이제 사용 X
DROP INDEX IF EXISTS idx_puzzle_offers_noshow_queue;
