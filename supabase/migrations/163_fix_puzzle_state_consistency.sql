-- ============================================================================
-- Migration 163: 깃발(Puzzle) 상태 정합성 결함 3건 일괄 수정
-- 날짜: 2026-05-14
-- 배경:
--   admin/깃발관리 페이지의 상태별 표시(취소/만료/성사 등)와 실제 DB 상태가
--   일치하지 않는 결함 3건을 일괄 수정한다.
--
-- BUG 1 (cron 자동 만료): notify_and_expire_puzzles() 가 puzzles만 expired로
--   바꾸고 pending puzzle_offers 정리/MD 슬롯 회복을 누락 → MD 슬롯 영구 점유.
--
-- BUG 2 (admin 강제 취소): admin_cancel_puzzle() 이 'accepted' 상태 취소를
--   허용하면서도 accepted 오퍼는 그대로 두고, 차감된 30 credits 미환불 →
--   UI에 "취소됨 깃발 + 선택됨 오퍼" 불일치 + MD 손실.
--
-- BUG 3 (admin 환불 처리): refund_puzzle_unlocks() 가 v1 puzzle_contact_unlocks
--   테이블만 환불 → v2 accept_offer 의 30 credits 환불 불가 + pending 오퍼
--   미정리.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG 1: notify_and_expire_puzzles() — pending 오퍼 정리 + MD 슬롯 회복
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_and_expire_puzzles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE puzzles
    SET status = 'expired'
    WHERE status = 'open' AND expires_at < now()
    RETURNING id, leader_id, area, event_date, notes
  ),
  expired_offers AS (
    UPDATE puzzle_offers
    SET status = 'expired', updated_at = now()
    WHERE puzzle_id IN (SELECT id FROM expired)
      AND status = 'pending'
    RETURNING md_id
  ),
  md_decrements AS (
    SELECT md_id, COUNT(*) AS dec FROM expired_offers GROUP BY md_id
  ),
  slot_restored AS (
    UPDATE users u
    SET md_active_offers_count = GREATEST(u.md_active_offers_count - md.dec, 0)
    FROM md_decrements md
    WHERE u.id = md.md_id
    RETURNING u.id
  ),
  notif AS (
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT
      leader_id, 'puzzle_expired_leader', '깃발이 만료됐어요',
      COALESCE(NULLIF(notes, ''), area || ' ' || to_char(event_date, 'MM/DD'))
        || ' 깃발의 시간이 끝났습니다. 결과를 확인해보세요.',
      '/bids?tab=puzzle'
    FROM expired
    WHERE leader_id IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION notify_and_expire_puzzles() IS
  'Migration 163: 만료 시 pending puzzle_offers 도 expired 로 전환하고 해당 MD 의 md_active_offers_count 를 감소시킨다. leader 인앱 알림 발송 유지.';

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG 1 backfill: 이미 만료된 깃발에 남아있는 pending 오퍼 일괄 정리
-- ─────────────────────────────────────────────────────────────────────────────
WITH orphan_offers AS (
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND puzzle_id IN (SELECT id FROM puzzles WHERE status = 'expired')
  RETURNING md_id
),
md_decrements AS (
  SELECT md_id, COUNT(*) AS dec FROM orphan_offers GROUP BY md_id
)
UPDATE users u
SET md_active_offers_count = GREATEST(u.md_active_offers_count - md.dec, 0)
FROM md_decrements md
WHERE u.id = md.md_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG 2: admin_cancel_puzzle() — 'accepted' 상태 취소 시 accepted 오퍼도 정리
--   + 차감된 30 credits 환불 + MD 알림
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_accepted puzzle_offers%ROWTYPE;
BEGIN
  IF (SELECT role FROM users WHERE id = auth.uid()) != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 사용할 수 있습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;

  IF v_puzzle.status IN ('cancelled', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 깃발입니다 (' || v_puzzle.status || ')');
  END IF;

  -- 'accepted' 상태: 수락된 오퍼 마무리 (visit 미마킹인 경우만)
  IF v_puzzle.status = 'accepted' THEN
    SELECT * INTO v_accepted FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND status = 'accepted'
    LIMIT 1;

    IF v_accepted.id IS NOT NULL AND v_accepted.visit_marked_at IS NULL THEN
      -- 오퍼를 expired 로 전환 (status CHECK 가 cancelled 미허용)
      UPDATE puzzle_offers
      SET status = 'expired', updated_at = now()
      WHERE id = v_accepted.id;

      -- accept_offer 시 차감된 30 credits 환불
      UPDATE users
      SET md_credits = md_credits + 30
      WHERE id = v_accepted.md_id;

      -- MD 에게 통보
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (
        v_accepted.md_id,
        'offer_withdrawn_by_admin',
        '깃발 강제 취소',
        '관리자가 깃발을 취소했습니다. 차감된 30 크레딧이 환불되었습니다.',
        '/flags/' || p_puzzle_id
      );
    END IF;
  END IF;

  -- 깃발 취소
  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 참여자 알림
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'puzzle_cancelled', '깃발 취소', '참여하신 깃발이 내려갔습니다.',
    '/flags/' || p_puzzle_id
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id;

  -- pending 오퍼 만료 + MD 슬롯 회복 (오퍼당 정확히 1회 감소)
  WITH expired_offers AS (
    UPDATE puzzle_offers
    SET status = 'expired', updated_at = now()
    WHERE puzzle_id = p_puzzle_id AND status = 'pending'
    RETURNING md_id
  ),
  md_decrements AS (
    SELECT md_id, COUNT(*) AS dec FROM expired_offers GROUP BY md_id
  )
  UPDATE users u
  SET md_active_offers_count = GREATEST(u.md_active_offers_count - md.dec, 0)
  FROM md_decrements md
  WHERE u.id = md.md_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_cancel_puzzle(UUID) IS
  'Migration 163: accepted 상태 강제 취소 시 accepted 오퍼를 expired 로 전환하고 차감된 30 credits 를 환불한다. visit_marked_at 이 이미 설정된 거래는 보호.';

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG 3: refund_puzzle_unlocks() — v2 accept_offer 흐름 지원
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refund_puzzle_unlocks(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_v1_count INTEGER := 0;
  v_v2_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;

  -- v1 환불: puzzle_contact_unlocks (legacy single-unlock 모델)
  WITH refunded AS (
    UPDATE users u
    SET md_credits = u.md_credits + pcu.credits_used
    FROM puzzle_contact_unlocks pcu
    WHERE u.id = pcu.md_id AND pcu.puzzle_id = p_puzzle_id
    RETURNING u.id
  )
  SELECT COUNT(*) INTO v_v1_count FROM refunded;

  -- v2 환불: accept_offer 시 차감된 30 credits (visit 미마킹 한정)
  WITH targets AS (
    SELECT id AS offer_id, md_id
    FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id
      AND status = 'accepted'
      AND visit_marked_at IS NULL
  ),
  refunded AS (
    UPDATE users u
    SET md_credits = u.md_credits + 30
    FROM targets t
    WHERE u.id = t.md_id
    RETURNING u.id, t.offer_id, t.md_id
  ),
  offer_closed AS (
    UPDATE puzzle_offers
    SET status = 'expired', updated_at = now()
    WHERE id IN (SELECT offer_id FROM refunded)
    RETURNING id
  ),
  md_notif AS (
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT md_id, 'offer_withdrawn_by_admin',
      '깃발 환불 처리',
      '관리자가 허위 깃발로 판정해 환불 처리했습니다. 30 크레딧이 반환되었습니다.',
      '/flags/' || p_puzzle_id
    FROM refunded
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_v2_count FROM refunded;

  -- pending 오퍼 만료 + MD 슬롯 회복
  WITH expired_offers AS (
    UPDATE puzzle_offers
    SET status = 'expired', updated_at = now()
    WHERE puzzle_id = p_puzzle_id AND status = 'pending'
    RETURNING md_id
  ),
  md_decrements AS (
    SELECT md_id, COUNT(*) AS dec FROM expired_offers GROUP BY md_id
  )
  UPDATE users u
  SET md_active_offers_count = GREATEST(u.md_active_offers_count - md.dec, 0)
  FROM md_decrements md
  WHERE u.id = md.md_id;

  -- 깃발 취소 + 참여자 알림 (이미 종료된 상태가 아닐 때만)
  IF v_puzzle.status NOT IN ('cancelled', 'expired') THEN
    UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT user_id, 'puzzle_cancelled', '깃발 취소',
      '참여하신 깃발이 관리자에 의해 취소됐습니다.',
      '/flags/' || p_puzzle_id
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id;
  END IF;

  -- 허위 매물 게시 유저 차단
  IF v_puzzle.leader_id IS NOT NULL THEN
    UPDATE users SET is_blocked = true WHERE id = v_puzzle.leader_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_count', v_v1_count + v_v2_count,
    'v1_refunds', v_v1_count,
    'v2_refunds', v_v2_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refund_puzzle_unlocks(UUID) IS
  'Migration 163: v1 puzzle_contact_unlocks 와 v2 accept_offer 양쪽 모두 환불 처리. pending 오퍼 expired 전환 + MD 슬롯 회복 + 깃발 cancelled + leader 차단.';
