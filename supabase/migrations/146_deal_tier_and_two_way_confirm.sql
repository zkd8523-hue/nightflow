-- ============================================================================
-- Migration 146: 거래 등급 시스템 (Silver/Gold/Diamond) + 양방향 거래확정
-- 날짜: 2026-05-09
-- 설명:
--   유저/MD의 누적 거래 카운트 → 자동 등급 부여(Silver 1+ / Gold 3+ / Diamond 10+)
--   가짜 거래 방지 위해 한쪽 신청 → 상대편 동의/이의 양방향 confirm 흐름
--   145 마이그레이션 자산(노쇼 OX 큐)은 그대로 유지
-- ============================================================================

-- ============================================================================
-- 1) 컬럼 추가
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deal_count_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE puzzle_offers
  ADD COLUMN IF NOT EXISTS visit_requested_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS visit_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_puzzle_offers_pending_confirm
  ON puzzle_offers(visit_requested_at)
  WHERE visit_requested_at IS NOT NULL AND visit_marked_at IS NULL;

-- ============================================================================
-- 2) 자동 카운트 트리거 (멱등성 엄격 검사)
-- ============================================================================

-- 깃발 거래완료 → leader & MD +1
CREATE OR REPLACE FUNCTION increment_deal_count_on_puzzle_visited()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id UUID;
BEGIN
  -- 멱등성: 처음 visit_marked_at이 set되고 visit_result='visited' 일 때만
  IF OLD.visit_marked_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.visit_marked_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.visit_result IS DISTINCT FROM 'visited' THEN RETURN NEW; END IF;

  SELECT leader_id INTO v_leader_id FROM puzzles WHERE id = NEW.puzzle_id;

  -- leader 카운트
  IF v_leader_id IS NOT NULL THEN
    UPDATE users SET deal_count_total = deal_count_total + 1 WHERE id = v_leader_id;
  END IF;

  -- MD 카운트
  IF NEW.md_id IS NOT NULL THEN
    UPDATE users SET deal_count_total = deal_count_total + 1 WHERE id = NEW.md_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_deal_count_on_puzzle_visited ON puzzle_offers;
CREATE TRIGGER trg_increment_deal_count_on_puzzle_visited
  AFTER UPDATE ON puzzle_offers
  FOR EACH ROW
  EXECUTE FUNCTION increment_deal_count_on_puzzle_visited();

-- 경매 거래확정 → winner & MD +1
CREATE OR REPLACE FUNCTION increment_deal_count_on_auction_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  -- 멱등성: status가 confirmed로 처음 진입할 때만
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN RETURN NEW; END IF;

  -- winner 카운트
  IF NEW.winner_id IS NOT NULL THEN
    UPDATE users SET deal_count_total = deal_count_total + 1 WHERE id = NEW.winner_id;
  END IF;

  -- MD 카운트
  IF NEW.md_id IS NOT NULL THEN
    UPDATE users SET deal_count_total = deal_count_total + 1 WHERE id = NEW.md_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_deal_count_on_auction_confirmed ON auctions;
CREATE TRIGGER trg_increment_deal_count_on_auction_confirmed
  AFTER UPDATE ON auctions
  FOR EACH ROW
  EXECUTE FUNCTION increment_deal_count_on_auction_confirmed();

-- ============================================================================
-- 3) 양방향 confirm RPC
-- ============================================================================

-- 거래확정 신청 (MD 또는 leader). 비대칭 처리:
--   - MD가 호출(visited/noshow): 즉시 확정 (검증된 파트너 신뢰)
--   - leader + visited: MD 응답 대기 (펌핑 방지)
--   - leader + noshow: 즉시 확정 (admin 검토 큐로)
CREATE OR REPLACE FUNCTION request_puzzle_visit_confirm(
  p_offer_id UUID,
  p_result TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
  v_caller_is_md BOOLEAN;
  v_immediate BOOLEAN;
  v_md_name TEXT;
  v_leader_name TEXT;
BEGIN
  IF p_result NOT IN ('visited', 'noshow') THEN
    RETURN jsonb_build_object('success', false, 'error', '결과는 visited 또는 noshow여야 합니다');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;

  IF v_caller != v_offer.md_id AND v_caller != v_puzzle.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 거래만 신청할 수 있습니다');
  END IF;

  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 신청할 수 있습니다');
  END IF;

  IF v_puzzle.event_date IS NULL OR v_puzzle.event_date >= CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', '이벤트 날짜가 지난 후에만 신청할 수 있습니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 확정된 거래입니다');
  END IF;

  IF v_offer.visit_requested_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 신청된 상태입니다 (상대편 응답 대기)');
  END IF;

  v_caller_is_md := (v_caller = v_offer.md_id);
  -- 즉시 확정 케이스: MD 호출(visited/noshow) OR leader가 noshow 신고
  v_immediate := v_caller_is_md OR p_result = 'noshow';

  -- 알림용 이름 조회
  SELECT COALESCE(display_name, name, 'MD') INTO v_md_name FROM users WHERE id = v_offer.md_id;
  SELECT COALESCE(display_name, name, '방장') INTO v_leader_name FROM users WHERE id = v_puzzle.leader_id;

  IF v_immediate THEN
    -- 즉시 확정: visit_marked_at 동시 set → 트리거가 카운트 처리 (visited만)
    UPDATE puzzle_offers
    SET visit_result = p_result,
        visit_requested_by = v_caller,
        visit_requested_at = now(),
        visit_marked_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- 알림: 상대편에게
    IF p_result = 'visited' AND v_caller_is_md THEN
      -- MD가 거래완료 → 유저에게 "거래 확정됨" + 카운트 +1 안내
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_puzzle.leader_id,
        'puzzle_visit_confirmed',
        '거래 확정됨',
        v_md_name || ' MD가 거래를 확정했습니다. 거래 카운트가 +1 적립되었습니다.',
        '/flags/' || v_puzzle.id
      );
    ELSIF p_result = 'noshow' AND v_caller_is_md THEN
      -- MD가 노쇼 신고 → 유저에게 "노쇼 신고 접수, 관리자 검토"
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_puzzle.leader_id,
        'puzzle_visit_noshow_filed',
        '노쇼 신고 접수',
        v_md_name || ' MD가 노쇼 신고를 접수했습니다. 관리자 검토 후 처리됩니다.',
        '/flags/' || v_puzzle.id
      );
    ELSIF p_result = 'noshow' AND NOT v_caller_is_md THEN
      -- 유저가 MD 노쇼 신고 → MD에게 "노쇼 신고 접수, 관리자 검토"
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_offer.md_id,
        'puzzle_visit_noshow_filed',
        '노쇼 신고 접수',
        '방장 ' || v_leader_name || '님이 노쇼 신고를 접수했습니다. 관리자 검토 후 처리됩니다.',
        '/md/dashboard'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'result', p_result,
      'immediate', true
    );
  ELSE
    -- 양방향 대기: leader가 visited 신청 → MD 응답 대기
    UPDATE puzzle_offers
    SET visit_result = p_result,
        visit_requested_by = v_caller,
        visit_requested_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- MD에게 응답 요청 알림
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.md_id,
      'puzzle_visit_confirm_requested',
      '거래확정 응답 요청',
      '방장 ' || v_leader_name || '님이 거래완료를 요청했습니다. 7일 내 응답 필요 (무응답 시 자동 확정).',
      '/md/dashboard'
    );

    RETURN jsonb_build_object(
      'success', true,
      'result', p_result,
      'immediate', false
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION request_puzzle_visit_confirm(UUID, TEXT) IS
  'Migration 146: 거래확정 신청. 비대칭 처리 — MD 호출 또는 noshow 신고 = 즉시 확정 / leader visited = MD 응답 대기. 알림 INSERT 포함.';

-- 상대편이 동의/이의
CREATE OR REPLACE FUNCTION confirm_puzzle_visit(
  p_offer_id UUID,
  p_action TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
  v_other_party UUID;
BEGIN
  IF p_action NOT IN ('agree', 'dispute') THEN
    RETURN jsonb_build_object('success', false, 'error', 'action은 agree 또는 dispute');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  IF v_offer.visit_requested_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '신청되지 않은 거래입니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 확정된 거래입니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- 상대편(신청자가 아닌 쪽)만 호출 가능
  IF v_caller = v_offer.visit_requested_by THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 신청한 건은 본인이 확정할 수 없습니다');
  END IF;

  -- 정확한 상대편(MD↔leader) 검증
  IF v_offer.visit_requested_by = v_offer.md_id THEN
    v_other_party := v_puzzle.leader_id;
  ELSE
    v_other_party := v_offer.md_id;
  END IF;

  IF v_caller != v_other_party THEN
    RETURN jsonb_build_object('success', false, 'error', '거래 당사자만 응답할 수 있습니다');
  END IF;

  IF p_action = 'agree' THEN
    UPDATE puzzle_offers
    SET visit_marked_at = now(),
        updated_at = now()
    WHERE id = p_offer_id;

    -- 신청자에게 "확정됨" 알림
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.visit_requested_by,
      'puzzle_visit_confirmed',
      '거래 확정됨',
      '상대편이 거래확정에 동의했습니다. 거래 카운트가 +1 적립되었습니다.',
      '/flags/' || v_offer.puzzle_id
    );

    RETURN jsonb_build_object('success', true, 'action', 'agreed', 'result', v_offer.visit_result);
  ELSE
    UPDATE puzzle_offers
    SET visit_result = 'noshow',
        visit_marked_at = now(),
        visit_requested_by = NULL,
        visit_requested_at = NULL,
        updated_at = now()
    WHERE id = p_offer_id;

    -- 신청자에게 이의 알림
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.visit_requested_by,
      'puzzle_visit_disputed',
      '이의 제기됨',
      '상대편이 이의를 제기했습니다. 관리자 검토 후 처리됩니다.',
      '/flags/' || v_offer.puzzle_id
    );

    RETURN jsonb_build_object('success', true, 'action', 'disputed');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION confirm_puzzle_visit(UUID, TEXT) IS
  'Migration 146: 신청 상대편이 동의/이의. agree → 카운트 +1, dispute → admin 큐.';

-- 이벤트 다음날 거래확정 OX 요청 알림 (cron 호출용)
CREATE OR REPLACE FUNCTION notify_puzzle_visit_pending()
RETURNS JSONB AS $$
DECLARE
  v_count INTEGER := 0;
  v_offer RECORD;
BEGIN
  FOR v_offer IN
    SELECT po.id, po.md_id, po.proposed_price,
           p.id AS puzzle_id, p.area, p.event_date, p.leader_id,
           COALESCE(u.display_name, u.name, '방장') AS leader_name
    FROM puzzle_offers po
    JOIN puzzles p ON p.id = po.puzzle_id
    JOIN users u ON u.id = p.leader_id
    WHERE po.status = 'accepted'
      AND po.visit_marked_at IS NULL
      AND po.visit_requested_at IS NULL
      AND p.event_date = CURRENT_DATE - INTERVAL '1 day'
  LOOP
    -- MD에게 OX 요청 (in-app)
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.md_id,
      'puzzle_visit_pending',
      '거래확정 응답 필요',
      '어제 ' || v_offer.area || ' 깃발(방장 ' || v_offer.leader_name || ') 거래 어땠나요? 거래완료/노쇼 입력해주세요.',
      '/md/dashboard'
    );

    -- 유저(방장)에게도 OX 요청 (필요 시 직접 신청 가능)
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_offer.leader_id,
      'puzzle_visit_pending',
      '거래 확인 필요',
      '어제 ' || v_offer.area || ' 깃발 거래 어떻게 되셨나요? 결과 확인하기.',
      '/flags/' || v_offer.puzzle_id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('notified', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_puzzle_visit_pending() IS
  'Migration 146: event_date+1일 시점, 양쪽에 OX 요청 알림 발송. 매일 오전 cron으로 호출.';

-- 7일 무응답 자동 처리 (cron 호출용)
CREATE OR REPLACE FUNCTION auto_confirm_expired_visits()
RETURNS JSONB AS $$
DECLARE
  v_visited_count INTEGER := 0;
  v_noshow_dispute_count INTEGER := 0;
  v_row RECORD;
BEGIN
  -- visited 신청 7일 무응답 → 자동 확정 (해피패스, 양쪽 알림)
  FOR v_row IN
    SELECT po.id, po.md_id, po.puzzle_id, p.leader_id
    FROM puzzle_offers po
    JOIN puzzles p ON p.id = po.puzzle_id
    WHERE po.visit_requested_at IS NOT NULL
      AND po.visit_marked_at IS NULL
      AND po.visit_result = 'visited'
      AND po.visit_requested_at < now() - INTERVAL '7 days'
  LOOP
    UPDATE puzzle_offers
    SET visit_marked_at = now(), updated_at = now()
    WHERE id = v_row.id;

    -- 양쪽 알림
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES
      (v_row.md_id, 'puzzle_visit_auto_confirmed', '거래 자동 확정',
        '7일 무응답으로 거래가 자동 확정되었습니다. 거래 카운트 +1 적립.',
        '/md/dashboard'),
      (v_row.leader_id, 'puzzle_visit_auto_confirmed', '거래 자동 확정',
        '7일 무응답으로 거래가 자동 확정되었습니다. 거래 카운트 +1 적립.',
        '/flags/' || v_row.puzzle_id);

    v_visited_count := v_visited_count + 1;
  END LOOP;

  -- noshow 신청 7일 무응답 → admin 큐로 (자동 strike 금지, 분쟁 검토 필요)
  WITH expired_noshow AS (
    UPDATE puzzle_offers
    SET visit_marked_at = now(),
        updated_at = now()
    WHERE visit_requested_at IS NOT NULL
      AND visit_marked_at IS NULL
      AND visit_result = 'noshow'
      AND visit_requested_at < now() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_noshow_dispute_count FROM expired_noshow;

  RETURN jsonb_build_object(
    'auto_visited', v_visited_count,
    'admin_queue_added', v_noshow_dispute_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_confirm_expired_visits() IS
  'Migration 146: 7일 무응답 처리. visited 자동 확정 / noshow는 admin 큐로.';

-- Admin 어뷰즈 적발 시 수동 차감 안전장치
CREATE OR REPLACE FUNCTION admin_revert_deal_count(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_admin users%ROWTYPE;
  v_user users%ROWTYPE;
  v_new_count INTEGER;
BEGIN
  SELECT * INTO v_admin FROM users WHERE id = auth.uid();
  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 호출할 수 있습니다');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount는 양수여야 합니다');
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '유저를 찾을 수 없습니다');
  END IF;

  v_new_count := GREATEST(v_user.deal_count_total - p_amount, 0);

  UPDATE users SET deal_count_total = v_new_count WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous', v_user.deal_count_total,
    'new', v_new_count,
    'reverted', v_user.deal_count_total - v_new_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_revert_deal_count(UUID, INTEGER) IS
  'Migration 146: admin이 어뷰즈 적발 시 deal_count_total 수동 차감. 0 이하로 안 내려감.';

-- ============================================================================
-- 4) user_trust_scores 뷰 확장 (deal_count_total + deal_tier 추가)
-- ============================================================================
CREATE OR REPLACE VIEW user_trust_scores AS
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
  COUNT(DISTINCT CASE WHEN po.visit_result = 'noshow' AND po.visit_marked_at IS NOT NULL THEN po.id END) AS puzzle_noshow_count,
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
  'Migration 146: deal_count_total/deal_tier 추가. 깃발 visited는 visit_marked_at NOT NULL 필터 (확정된 것만).';

-- ============================================================================
-- 4-2) public_user_profiles 뷰 갱신 — md_deal_count를 deal_count_total로 통일
--      기존 119 마이그레이션은 'contacted+confirmed'를 inline 계산했으나, 새 단일 소스로 전환
-- ============================================================================
CREATE OR REPLACE VIEW public_user_profiles AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.role,
  u.md_unique_slug,
  u.md_customer_grade,
  u.is_reviewer,
  u.deal_count_total,
  CASE WHEN u.role = 'md' THEN u.instagram END AS instagram,
  CASE WHEN u.role = 'md' THEN u.kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN u.role = 'md' THEN u.preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN u.role = 'md' THEN u.phone END AS phone,
  -- md_deal_count는 deal_count_total과 동기화 (단일 소스)
  CASE WHEN u.role = 'md' THEN u.deal_count_total END AS md_deal_count
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;

-- ============================================================================
-- 5) Backfill (1회성) — 기존 데이터로 deal_count_total 초기화
-- ============================================================================
UPDATE users u SET deal_count_total = COALESCE((
  -- 깃발 leader로서 visited 카운트
  SELECT COUNT(*) FROM puzzle_offers po
  JOIN puzzles p ON p.id = po.puzzle_id
  WHERE p.leader_id = u.id
    AND po.visit_result = 'visited'
    AND po.visit_marked_at IS NOT NULL
), 0) + COALESCE((
  -- 깃발 MD로서 visited 카운트
  SELECT COUNT(*) FROM puzzle_offers po
  WHERE po.md_id = u.id
    AND po.visit_result = 'visited'
    AND po.visit_marked_at IS NOT NULL
), 0) + COALESCE((
  -- 경매 winner로서 confirmed 카운트
  SELECT COUNT(*) FROM auctions a
  WHERE a.winner_id = u.id AND a.status = 'confirmed'
), 0) + COALESCE((
  -- 경매 MD로서 confirmed 카운트
  SELECT COUNT(*) FROM auctions a
  WHERE a.md_id = u.id AND a.status = 'confirmed'
), 0);
