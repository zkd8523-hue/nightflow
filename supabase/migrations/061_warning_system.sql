-- Migration 061: 경고 시스템 (시간 기반 취소 정책)
-- 날짜: 2026-03-12
-- 목적:
--   1. cancellation_type에 'user_immediate' 추가 (2분 이내 즉시 취소)
--   2. user_warnings 테이블 생성 (경고점 누적 추적)
--   3. users.warning_count 캐시 컬럼 추가
--   4. apply_cancel_warning() RPC 함수 (경고 부과 + 스트라이크 전환)
--
-- 정책:
--   즉시 취소 (2분 이내)  → 무패널티
--   Grace 취소 (전반 50%) → 경고 +1
--   Late 취소 (후반 50%)  → 경고 +2
--   노쇼 (타이머 만료)    → 즉시 스트라이크 +1 (기존 유지)
--   3경고 = 1스트라이크

-- ============================================================
-- 1. cancellation_type에 'user_immediate' 추가
-- ============================================================

ALTER TYPE cancellation_type ADD VALUE IF NOT EXISTS 'user_immediate';

-- ============================================================
-- 2. user_warnings 테이블 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  warning_points INTEGER NOT NULL CHECK (warning_points IN (1, 2)),
  cancel_type cancellation_type NOT NULL,
  consumed_by_strike BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON user_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_warnings_unconsumed ON user_warnings(user_id) WHERE consumed_by_strike = false;

ALTER TABLE user_warnings ENABLE ROW LEVEL SECURITY;

-- 본인 조회만 허용
CREATE POLICY "Users can view own warnings"
  ON user_warnings FOR SELECT
  USING (auth.uid() = user_id);

-- Admin 전체 조회
CREATE POLICY "Admins can view all warnings"
  ON user_warnings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT/UPDATE/DELETE는 서버(service_role)만 가능 — RPC를 통해서만 삽입

-- ============================================================
-- 3. users.warning_count 캐시 컬럼 추가
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 4. apply_cancel_warning() RPC 함수
-- ============================================================

CREATE OR REPLACE FUNCTION apply_cancel_warning(
  p_user_id UUID,
  p_auction_id UUID,
  p_warning_points INTEGER,
  p_cancel_type cancellation_type
)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_total_unconsumed INTEGER;
  v_strike_result JSON := NULL;
  v_strike_triggered BOOLEAN := false;
BEGIN
  -- 1. user row FOR UPDATE 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다';
  END IF;

  -- 2. user_warnings INSERT
  INSERT INTO user_warnings (user_id, auction_id, warning_points, cancel_type)
  VALUES (p_user_id, p_auction_id, p_warning_points, p_cancel_type);

  -- 3. 미소진(consumed=false) 경고점 합산
  SELECT COALESCE(SUM(warning_points), 0)
  INTO v_total_unconsumed
  FROM user_warnings
  WHERE user_id = p_user_id AND consumed_by_strike = false;

  -- 4. warning_count 캐시 업데이트
  UPDATE users SET warning_count = v_total_unconsumed WHERE id = p_user_id;

  -- 5. 합산 >= 3이면: 모든 미소진 경고 consumed 처리 → apply_noshow_strike() 호출
  IF v_total_unconsumed >= 3 THEN
    -- 미소진 경고 모두 소진 처리
    UPDATE user_warnings
    SET consumed_by_strike = true
    WHERE user_id = p_user_id AND consumed_by_strike = false;

    -- 스트라이크 부과
    v_strike_result := apply_noshow_strike(p_user_id);
    v_strike_triggered := true;

    -- 소진 후 남은 경고점 재계산 (항상 0이 됨)
    SELECT COALESCE(SUM(warning_points), 0)
    INTO v_total_unconsumed
    FROM user_warnings
    WHERE user_id = p_user_id AND consumed_by_strike = false;

    UPDATE users SET warning_count = v_total_unconsumed WHERE id = p_user_id;
  END IF;

  -- 6. JSON 반환
  RETURN json_build_object(
    'warning_points', p_warning_points,
    'total_warnings', v_total_unconsumed,
    'strike_triggered', v_strike_triggered,
    'strike_result', v_strike_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_cancel_warning(UUID, UUID, INTEGER, cancellation_type)
  IS '취소 경고 부과: Grace +1, Late +2. 3경고 = 1스트라이크 자동 전환 (2026-03-12)';

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
