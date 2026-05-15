-- ============================================================================
-- Migration 170: 깃발 2단계 마감 모델 (오퍼 마감 오후 3시 + 유저 검토 90분)
-- 날짜: 2026-05-15
-- 설명:
--   Phase 1 (~오후 3시): MD 오퍼 제출 가능. 유저 즉시 수락 가능.
--   Phase 2 (오후 3:00~4:30): 오퍼 마감. 유저 검토/선택만 가능.
--   오후 4:30: 유저 미선택 시 자동 만료.
--
--   신규 컬럼:
--     - offer_deadline: 오퍼 마감 시각 (NULL = 기존 자정 마감 깃발 → 단계 전환 없음)
--     - review_ending_notified_at: 15분 임박 알림 발송 시각 (중복 발송 방지)
--
--   기존 자정 마감 깃발: offer_deadline IS NULL → 기존 open→expired 흐름 유지
-- ============================================================================

-- 1) status CHECK constraint에 'selecting' 추가
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_status_check;
ALTER TABLE puzzles ADD CONSTRAINT puzzles_status_check
  CHECK (status IN ('open', 'selecting', 'matched', 'cancelled', 'expired', 'accepted'));

-- 2) 신규 컬럼 추가
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS offer_deadline TIMESTAMPTZ;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS review_ending_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_puzzles_offer_deadline
  ON puzzles(offer_deadline) WHERE status = 'open';

-- ============================================================================
-- 3) notify_and_expire_puzzles() 재정의
--    기존: open → expired (단순 만료)
--    신규:
--      (a) open → selecting: offer_deadline IS NOT NULL AND offer_deadline <= now()
--      (b) open/selecting → expired: expires_at <= now()
--      (c) selecting 15분 임박 알림 (review_ending_notified_at IS NULL 체크로 1회 보장)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_and_expire_puzzles() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- (a) open → selecting: 신규 깃발(offer_deadline IS NOT NULL)의 오퍼 마감 시각 도래
  WITH transitioned AS (
    UPDATE puzzles
       SET status = 'selecting'
     WHERE status = 'open'
       AND offer_deadline IS NOT NULL
       AND offer_deadline <= now()
       AND expires_at > now()
    RETURNING id, leader_id, area, event_date
  ),
  notif_leader AS (
    INSERT INTO notifications (user_id, type, message, action_url)
    SELECT
      leader_id,
      'puzzle_review_started',
      area || ' ' || to_char(event_date, 'MM/DD') || ' 깃발 오퍼 마감 · 90분 안에 선택해주세요',
      '/flags/' || id
    FROM transitioned
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  notif_md AS (
    INSERT INTO notifications (user_id, type, message, action_url)
    SELECT DISTINCT
      po.md_id,
      'puzzle_review_md',
      '제안한 깃발이 유저 검토 단계입니다',
      '/flags/' || t.id
    FROM transitioned t
    JOIN puzzle_offers po ON po.puzzle_id = t.id AND po.status = 'pending'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM transitioned;

  -- (b) open/selecting → expired: 최종 만료
  --     기존 자정 마감 깃발(offer_deadline IS NULL)도 여기서 처리됨
  WITH expired AS (
    UPDATE puzzles
       SET status = 'expired'
     WHERE status IN ('open', 'selecting')
       AND expires_at <= now()
    RETURNING id, leader_id, area, event_date
  )
  INSERT INTO notifications (user_id, type, message, action_url)
  SELECT
    leader_id,
    'puzzle_expired_leader',
    area || ' ' || to_char(event_date, 'MM/DD') || ' 깃발의 시간이 끝났습니다',
    '/bids?tab=puzzle'
  FROM expired
  ON CONFLICT DO NOTHING;

  -- (c) selecting 상태 15분 임박 알림 — review_ending_notified_at IS NULL로 1회 보장
  WITH to_notify AS (
    UPDATE puzzles
       SET review_ending_notified_at = now()
     WHERE status = 'selecting'
       AND review_ending_notified_at IS NULL
       AND expires_at - INTERVAL '15 minutes' <= now()
       AND expires_at > now()
    RETURNING id, leader_id, area, event_date
  )
  INSERT INTO notifications (user_id, type, message, action_url)
  SELECT
    leader_id,
    'puzzle_review_ending',
    area || ' ' || to_char(event_date, 'MM/DD') || ' 깃발 곧 만료 · 지금 결정하세요',
    '/flags/' || id
  FROM to_notify
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4) accept_offer(): 'selecting' 상태에서도 수락 허용
--    변경: status != 'open' → status NOT IN ('open', 'selecting')
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md users%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

  -- 검증
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  -- 'open' 또는 'selecting' 상태에서만 수락 가능
  IF v_puzzle.status NOT IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  IF v_md.md_credits < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  -- 오퍼 수락
  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 나머지 pending 오퍼 expired 처리
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  -- 탈락 MD들 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  -- 탈락 MD들에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  -- 퍼즐 상태 변경
  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 + 슬롯 감소
  UPDATE users SET
    md_credits = md_credits - 30,
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  -- 수락된 MD에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5) update_offer(): 'selecting' 단계에선 수정 불가 (이미 status='open' 체크 있음 — 확인용 주석)
--    Migration 169 함수는 이미 puzzles.status = 'open' 체크 → 변경 없음.
--    'selecting' 상태 깃발은 자동으로 수정 거부됨.
-- ============================================================================

-- ============================================================================
-- 6) withdraw_offer(): 'selecting' 단계에선 철회 불가
--    기존 함수는 puzzle.status 체크 없음 → 추가 필요
-- ============================================================================
CREATE OR REPLACE FUNCTION withdraw_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF v_offer.md_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;

  -- 유저 검토 단계에선 철회 불가
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.status NOT IN ('open') THEN
    RETURN jsonb_build_object('success', false, 'error', '유저 검토 중에는 오퍼를 철회할 수 없습니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE id = p_offer_id;

  -- 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
