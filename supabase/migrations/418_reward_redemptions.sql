-- Migration 418: 스탬프 → 보상 발행(교환) + 어드민 집계
--
-- 413(user_stamps/stamp_history) 위에 실제 교환 시스템을 얹는다.
--   1) reward_catalog: 보상 카탈로그 (비용/재고/활성 — 서버 진실 소스)
--   2) reward_redemptions: 유저 발행 기록 (어드민이 집계·처리)
--   3) redeem_reward(code): 스탬프 차감 + 재고 감소 + 기록 생성 (원자적, FOR UPDATE 락)
--   4) 어드민 처리/환불 RPC
--
-- 프론트(/my/stamps)의 하드코딩 표현(이미지/추첨 등수)은 유지하고,
-- 비용/재고 검증만 이 카탈로그로 서버화 (클라이언트 조작 방지).

-- ============================================
-- 1) 보상 카탈로그
-- ============================================
CREATE TABLE IF NOT EXISTS reward_catalog (
  code        TEXT PRIMARY KEY,                 -- 프론트 REWARDS.id와 일치 (chocoemong 등)
  name        TEXT NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'product'
              CHECK (reward_type IN ('product', 'voucher', 'raffle')),
  stamp_cost  INT  NOT NULL CHECK (stamp_cost > 0),
  stock       INT,                              -- NULL = 무제한 (추첨 등)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reward_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active catalog" ON reward_catalog;
CREATE POLICY "Anyone can read active catalog"
  ON reward_catalog FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admin can manage catalog" ON reward_catalog;
CREATE POLICY "Admin can manage catalog"
  ON reward_catalog FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 초기 카탈로그 (프론트 3종과 매칭)
INSERT INTO reward_catalog (code, name, reward_type, stamp_cost, stock, sort_order) VALUES
  ('chocoemong',  'GS25 초코에몽',        'product', 2,  100,  1),
  ('voucher-10k', 'GS25 1만원 상품권',    'voucher', 10, 20,   2),
  ('raffle',      '월간 추첨 응모',        'raffle',  5,  NULL, 3)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE reward_catalog IS
  'Migration 418: 보상 카탈로그. code는 프론트 하드코딩 id와 매칭. 비용/재고 서버 진실 소스.';

-- ============================================
-- 2) 발행(교환) 기록
-- ============================================
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_code  TEXT NOT NULL,
  reward_name  TEXT NOT NULL,                   -- 교환 시점 스냅샷 (카탈로그 변경 무관)
  reward_type  TEXT NOT NULL DEFAULT 'product',
  stamp_cost   INT  NOT NULL,                   -- 교환 시점 비용 스냅샷
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  admin_note   TEXT,                            -- 처리 메모 (송장/기프티콘 코드 등)
  fulfilled_by UUID REFERENCES users(id),
  fulfilled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_status ON reward_redemptions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_user   ON reward_redemptions(user_id, created_at DESC);

ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User can read own redemptions" ON reward_redemptions;
CREATE POLICY "User can read own redemptions"
  ON reward_redemptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can read all redemptions" ON reward_redemptions;
CREATE POLICY "Admin can read all redemptions"
  ON reward_redemptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin can update redemptions" ON reward_redemptions;
CREATE POLICY "Admin can update redemptions"
  ON reward_redemptions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- INSERT는 redeem_reward RPC(SECURITY DEFINER)로만

COMMENT ON TABLE reward_redemptions IS
  'Migration 418: 스탬프 보상 발행 기록. redeem_reward()로만 생성. 어드민이 pending→fulfilled 처리.';

-- 413에서 예약했던 stamp_history.related_redemption_id FK 연결
ALTER TABLE stamp_history DROP CONSTRAINT IF EXISTS stamp_history_redemption_fk;
ALTER TABLE stamp_history
  ADD CONSTRAINT stamp_history_redemption_fk
  FOREIGN KEY (related_redemption_id) REFERENCES reward_redemptions(id) ON DELETE SET NULL;

-- ============================================
-- 3) 교환 RPC (원자적: 카탈로그 락 → 스탬프 락 → 차감 → 재고 → 기록)
-- ============================================
CREATE OR REPLACE FUNCTION redeem_reward(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_cat     reward_catalog%ROWTYPE;
  v_balance INT;
  v_rid     UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 카탈로그 락 (재고 동시성)
  SELECT * INTO v_cat FROM reward_catalog WHERE code = p_code FOR UPDATE;
  IF v_cat.code IS NULL OR NOT v_cat.is_active THEN
    RAISE EXCEPTION 'REWARD_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_cat.stock IS NOT NULL AND v_cat.stock <= 0 THEN
    RAISE EXCEPTION 'REWARD_SOLD_OUT' USING ERRCODE = 'P0001';
  END IF;

  -- 스탬프 락 + 잔량 확인
  SELECT current_count INTO v_balance FROM user_stamps WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cat.stamp_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_STAMPS' USING ERRCODE = 'P0001';
  END IF;

  -- 차감
  UPDATE user_stamps
    SET current_count = current_count - v_cat.stamp_cost, updated_at = now()
    WHERE user_id = v_uid;

  -- 재고 감소 (NULL = 무제한, 감소 안 함)
  IF v_cat.stock IS NOT NULL THEN
    UPDATE reward_catalog SET stock = stock - 1, updated_at = now() WHERE code = p_code;
  END IF;

  -- 발행 기록 (pending)
  INSERT INTO reward_redemptions (user_id, reward_code, reward_name, reward_type, stamp_cost, status)
    VALUES (v_uid, v_cat.code, v_cat.name, v_cat.reward_type, v_cat.stamp_cost, 'pending')
    RETURNING id INTO v_rid;

  -- 스탬프 이력 (차감)
  INSERT INTO stamp_history (user_id, delta, reason, related_redemption_id)
    VALUES (v_uid, -v_cat.stamp_cost, 'redeem', v_rid);

  RETURN json_build_object(
    'success', TRUE,
    'redemption_id', v_rid,
    'reward_name', v_cat.name,
    'new_balance', v_balance - v_cat.stamp_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_reward(TEXT) TO authenticated;

COMMENT ON FUNCTION redeem_reward(TEXT) IS
  'Migration 418: 스탬프로 보상 발행. 카탈로그/스탬프 FOR UPDATE 락으로 동시성 안전.';

-- ============================================
-- 4a) 어드민: 처리완료 (지급 확정)
-- ============================================
CREATE OR REPLACE FUNCTION fulfill_redemption(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'P0001';
  END IF;

  UPDATE reward_redemptions
    SET status = 'fulfilled',
        admin_note = COALESCE(p_note, admin_note),
        fulfilled_by = v_uid,
        fulfilled_at = now()
    WHERE id = p_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_PENDING' USING ERRCODE = 'P0001';
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION fulfill_redemption(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION fulfill_redemption(UUID, TEXT) IS
  'Migration 418: 어드민이 발행을 지급완료 처리 (pending → fulfilled).';

-- ============================================
-- 4b) 어드민: 발행 취소 + 스탬프/재고 환불 (노쇼·재고소진 등)
-- ============================================
CREATE OR REPLACE FUNCTION cancel_redemption_with_refund(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_red reward_redemptions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_red FROM reward_redemptions WHERE id = p_id FOR UPDATE;
  IF v_red.id IS NULL THEN
    RAISE EXCEPTION 'REDEMPTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_red.status = 'cancelled' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED' USING ERRCODE = 'P0001';
  END IF;

  -- 스탬프 환불
  INSERT INTO user_stamps (user_id, current_count, total_earned, updated_at)
    VALUES (v_red.user_id, v_red.stamp_cost, 0, now())
    ON CONFLICT (user_id) DO UPDATE SET
      current_count = user_stamps.current_count + v_red.stamp_cost,
      updated_at = now();

  -- 재고 복원 (무제한이 아니었던 카탈로그만)
  UPDATE reward_catalog SET stock = stock + 1, updated_at = now()
    WHERE code = v_red.reward_code AND stock IS NOT NULL;

  -- 상태/메모
  UPDATE reward_redemptions
    SET status = 'cancelled', admin_note = COALESCE(p_note, admin_note),
        fulfilled_by = v_uid, fulfilled_at = now()
    WHERE id = p_id;

  -- 이력 (환불 = admin_grant)
  INSERT INTO stamp_history (user_id, delta, reason, related_redemption_id)
    VALUES (v_red.user_id, v_red.stamp_cost, 'admin_grant', p_id);

  RETURN json_build_object('success', TRUE, 'refunded', v_red.stamp_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_redemption_with_refund(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_redemption_with_refund(UUID, TEXT) IS
  'Migration 418: 어드민 발행 취소 + 스탬프/재고 환불.';
