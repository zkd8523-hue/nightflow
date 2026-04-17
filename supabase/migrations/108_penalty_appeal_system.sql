-- ============================================================================
-- Migration 108: 노쇼 이력 + 이의제기 시스템
-- 날짜: 2026-04-18
-- 설명:
--   1. noshow_history 테이블 — 어느 경매에서 노쇼가 발생했는지 추적
--   2. penalty_appeals 테이블 — 이의제기 제출/검토
--   3. apply_noshow_strike() 수정 — auction_id 파라미터 추가, noshow_history INSERT,
--      action_url → '/my-penalties' 변경
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. noshow_history 테이블
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE noshow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auction_id UUID REFERENCES auctions(id) ON DELETE SET NULL,
  strike_count_at_time INTEGER NOT NULL,
  penalty_action TEXT NOT NULL
    CHECK (penalty_action IN ('block_3_days', 'block_14_days', 'block_60_days', 'permanent_block')),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_noshow_history_user ON noshow_history(user_id);
CREATE INDEX idx_noshow_history_auction ON noshow_history(auction_id);

ALTER TABLE noshow_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own noshow history" ON noshow_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all noshow history" ON noshow_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. penalty_appeals 테이블
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE penalty_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  noshow_history_id UUID NOT NULL REFERENCES noshow_history(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(noshow_history_id)
);

CREATE INDEX idx_appeals_user ON penalty_appeals(user_id);
CREATE INDEX idx_appeals_status ON penalty_appeals(status) WHERE status = 'pending';

ALTER TABLE penalty_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own appeals" ON penalty_appeals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own appeals" ON penalty_appeals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all appeals" ON penalty_appeals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. apply_noshow_strike() 수정
--    - p_auction_id 파라미터 추가 (NULL 허용 — 기존 호출 깨지지 않음)
--    - 각 분기마다 noshow_history INSERT
--    - action_url → '/my-penalties'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_noshow_strike(
  p_user_id UUID,
  p_auction_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_new_strike INTEGER;
  v_history_id UUID;
  v_blocked_until TIMESTAMPTZ;
  v_penalty_action TEXT;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  v_new_strike := v_user.strike_count + 1;

  IF v_new_strike >= 4 THEN
    -- 4회 이상: 영구 차단
    UPDATE users SET
      strike_count = v_new_strike,
      is_blocked = true,
      noshow_count = noshow_count + 1,
      last_strike_at = now()
    WHERE id = p_user_id;

    v_penalty_action := 'permanent_block';
    v_blocked_until := NULL;

    INSERT INTO noshow_history (user_id, auction_id, strike_count_at_time, penalty_action, blocked_until)
    VALUES (p_user_id, p_auction_id, v_new_strike, v_penalty_action, v_blocked_until)
    RETURNING id INTO v_history_id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '계정이 영구 차단되었습니다',
      '노쇼 4회 누적으로 NightFlow 이용이 영구적으로 제한됩니다. 문의는 고객센터로 연락주세요.',
      '/my-penalties'
    );

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'permanent_block',
      'waiver_used', false,
      'history_id', v_history_id
    );

  ELSIF v_new_strike = 3 THEN
    -- 3회: 60일 정지
    v_blocked_until := now() + INTERVAL '60 days';
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = v_blocked_until,
      noshow_count = noshow_count + 1,
      last_strike_at = now()
    WHERE id = p_user_id;

    v_penalty_action := 'block_60_days';

    INSERT INTO noshow_history (user_id, auction_id, strike_count_at_time, penalty_action, blocked_until)
    VALUES (p_user_id, p_auction_id, v_new_strike, v_penalty_action, v_blocked_until)
    RETURNING id INTO v_history_id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '60일간 이용이 정지되었습니다',
      '노쇼 3회 누적으로 60일간 NightFlow 이용이 정지됩니다. 다음 노쇼 시 영구 차단됩니다.',
      '/my-penalties'
    );

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_60_days',
      'blocked_until', v_blocked_until,
      'waiver_used', false,
      'history_id', v_history_id
    );

  ELSIF v_new_strike = 2 THEN
    -- 2회: 14일 정지
    v_blocked_until := now() + INTERVAL '14 days';
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = v_blocked_until,
      noshow_count = noshow_count + 1,
      last_strike_at = now()
    WHERE id = p_user_id;

    v_penalty_action := 'block_14_days';

    INSERT INTO noshow_history (user_id, auction_id, strike_count_at_time, penalty_action, blocked_until)
    VALUES (p_user_id, p_auction_id, v_new_strike, v_penalty_action, v_blocked_until)
    RETURNING id INTO v_history_id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '14일간 이용이 정지되었습니다',
      '노쇼 2회 누적으로 14일간 NightFlow 이용이 정지됩니다. 추가 노쇼 시 정지 기간이 더 길어집니다.',
      '/my-penalties'
    );

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_14_days',
      'blocked_until', v_blocked_until,
      'waiver_used', false,
      'history_id', v_history_id
    );

  ELSE
    -- 1회: 3일 정지
    v_blocked_until := now() + INTERVAL '3 days';
    UPDATE users SET
      strike_count = v_new_strike,
      blocked_until = v_blocked_until,
      noshow_count = noshow_count + 1,
      last_strike_at = now()
    WHERE id = p_user_id;

    v_penalty_action := 'block_3_days';

    INSERT INTO noshow_history (user_id, auction_id, strike_count_at_time, penalty_action, blocked_until)
    VALUES (p_user_id, p_auction_id, v_new_strike, v_penalty_action, v_blocked_until)
    RETURNING id INTO v_history_id;

    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'noshow_penalty',
      '3일간 이용이 정지되었습니다',
      '노쇼 1회로 3일간 NightFlow 이용이 정지됩니다. 추가 노쇼 시 정지 기간이 더 길어집니다.',
      '/my-penalties'
    );

    RETURN json_build_object(
      'strike_count', v_new_strike,
      'action', 'block_3_days',
      'blocked_until', v_blocked_until,
      'waiver_used', false,
      'history_id', v_history_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
