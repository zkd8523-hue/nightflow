-- Migration 071: 회원탈퇴 (Soft Delete + 30일 복구 + 제재 블랙리스트)
-- 날짜: 2026-03-16

-- ============================================================
-- (a) users 테이블에 필요한 컬럼 보장
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- (b) 제재 이력 블랙리스트 테이블
--     탈퇴 시 제재 정보를 보관하여 재가입 시 이어감
-- ============================================================
CREATE TABLE IF NOT EXISTS deleted_user_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_id TEXT NOT NULL,
  strike_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kakao_id)
);

-- ============================================================
-- (c) Soft Delete 함수 (탈퇴 요청 처리)
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
  v_active_count INTEGER;
  v_won_count INTEGER;
BEGIN
  -- 1. 유저 조회 + 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- 이미 탈퇴 처리된 경우
  IF v_user.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 탈퇴 처리된 계정입니다';
  END IF;

  -- 2. Admin 차단
  IF v_user.role = 'admin' THEN
    RAISE EXCEPTION '관리자 계정은 탈퇴할 수 없습니다';
  END IF;

  -- 3. MD 활성 경매 체크
  IF v_user.role = 'md' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM auctions
    WHERE md_id = p_user_id
      AND status IN ('active', 'scheduled', 'won', 'contacted');

    IF v_active_count > 0 THEN
      RAISE EXCEPTION '활성 경매 %건이 있어 탈퇴할 수 없습니다', v_active_count;
    END IF;
  END IF;

  -- 4. 진행 중인 낙찰 체크
  SELECT COUNT(*) INTO v_won_count
  FROM auctions
  WHERE winner_id = p_user_id
    AND status IN ('won', 'contacted');

  IF v_won_count > 0 THEN
    RAISE EXCEPTION '진행 중인 낙찰 %건이 있어 탈퇴할 수 없습니다', v_won_count;
  END IF;

  -- 5. Soft Delete
  UPDATE users SET deleted_at = now() WHERE id = p_user_id;

  -- 6. 제재 기록이 있으면 블랙리스트에 저장
  IF v_user.kakao_id IS NOT NULL AND (
    v_user.strike_count > 0 OR
    v_user.warning_count > 0 OR
    v_user.is_blocked OR
    v_user.blocked_until IS NOT NULL
  ) THEN
    INSERT INTO deleted_user_penalties (
      kakao_id, strike_count, warning_count, is_blocked, blocked_until
    ) VALUES (
      v_user.kakao_id,
      COALESCE(v_user.strike_count, 0),
      COALESCE(v_user.warning_count, 0),
      COALESCE(v_user.is_blocked, false),
      v_user.blocked_until
    )
    ON CONFLICT (kakao_id) DO UPDATE SET
      strike_count = EXCLUDED.strike_count,
      warning_count = EXCLUDED.warning_count,
      is_blocked = EXCLUDED.is_blocked,
      blocked_until = EXCLUDED.blocked_until,
      deleted_at = now();
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- (d) 계정 복구 함수
-- ============================================================
CREATE OR REPLACE FUNCTION restore_user_account(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  IF v_user.deleted_at IS NULL THEN
    RAISE EXCEPTION '탈퇴 처리되지 않은 계정입니다';
  END IF;

  -- 30일 초과 체크
  IF v_user.deleted_at < now() - interval '30 days' THEN
    RAISE EXCEPTION '복구 가능 기간(30일)이 만료되었습니다';
  END IF;

  -- 복구
  UPDATE users SET deleted_at = NULL WHERE id = p_user_id;

  -- 블랙리스트에서 제거 (복구했으므로 제재가 유저 테이블에 살아있음)
  IF v_user.kakao_id IS NOT NULL THEN
    DELETE FROM deleted_user_penalties WHERE kakao_id = v_user.kakao_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'restored_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- (e) Hard Delete 함수 (30일 후 영구 삭제, Cron 전용)
-- ============================================================
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- 1. 유저 조회 + 락
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- deleted_at이 30일 이상 경과했는지 확인
  IF v_user.deleted_at IS NULL THEN
    RAISE EXCEPTION '탈퇴 처리되지 않은 계정입니다';
  END IF;

  IF v_user.deleted_at > now() - interval '30 days' THEN
    RAISE EXCEPTION '30일 유예 기간이 아직 남아있습니다';
  END IF;

  -- 2. nullable FK SET NULL
  UPDATE auctions SET winner_id = NULL WHERE winner_id = p_user_id;
  UPDATE auctions SET fallback_from_winner_id = NULL WHERE fallback_from_winner_id = p_user_id;
  UPDATE transactions SET confirmed_by = NULL WHERE confirmed_by = p_user_id;
  UPDATE transactions SET referrer_md_id = NULL WHERE referrer_md_id = p_user_id;
  UPDATE notification_logs SET recipient_user_id = NULL WHERE recipient_user_id = p_user_id;

  -- 3. NOT NULL FK rows DELETE
  DELETE FROM bids WHERE bidder_id = p_user_id;
  DELETE FROM transactions WHERE buyer_id = p_user_id;
  DELETE FROM transactions WHERE md_id = p_user_id;
  DELETE FROM auctions WHERE md_id = p_user_id;
  DELETE FROM settlement_logs WHERE md_id = p_user_id;
  DELETE FROM bank_verifications WHERE md_id = p_user_id;

  -- 4. DELETE user (CASCADE handles remaining tables)
  DELETE FROM users WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'deleted_user_id', p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- (f) 재가입 시 제재 복원 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION restore_penalties_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_penalty RECORD;
BEGIN
  IF NEW.kakao_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_penalty FROM deleted_user_penalties
    WHERE kakao_id = NEW.kakao_id;

  IF FOUND THEN
    NEW.strike_count := v_penalty.strike_count;
    NEW.warning_count := v_penalty.warning_count;
    NEW.is_blocked := v_penalty.is_blocked;
    NEW.blocked_until := v_penalty.blocked_until;
    DELETE FROM deleted_user_penalties WHERE kakao_id = NEW.kakao_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER apply_penalty_on_signup
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION restore_penalties_on_signup();

-- ============================================================
-- 코멘트
-- ============================================================
COMMENT ON FUNCTION soft_delete_user(UUID) IS '회원탈퇴: Soft Delete 처리. 30일 후 영구 삭제. service_role 전용.';
COMMENT ON FUNCTION restore_user_account(UUID) IS '계정 복구: 30일 이내 탈퇴 계정 복구. service_role 전용.';
COMMENT ON FUNCTION delete_user_account(UUID) IS '영구 삭제: 30일 경과 후 모든 데이터 삭제. Cron 전용.';
COMMENT ON TABLE deleted_user_penalties IS '탈퇴 유저 제재 블랙리스트: 재가입 시 제재 이어감.';
