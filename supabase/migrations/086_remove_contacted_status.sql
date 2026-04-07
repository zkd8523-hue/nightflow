-- Migration 086: Remove 'contacted' auction status
--
-- Background:
--   The 'contacted' status was a self-reported intermediate state between
--   'won' and 'confirmed' (user clicks contact button → status flips to
--   contacted, contact_deadline is cleared, no-show timer is cancelled).
--
--   In practice it was a no-op for the no-show flow (clearing
--   contact_deadline alone is sufficient — expire-contacts only targets
--   status='won' AND contact_deadline < now()), and it gave users a false
--   sense of safety since the "contacted" badge was never validated by the
--   MD. We're collapsing the flow to: won → confirmed.
--
-- Strategy:
--   1. Backfill any existing rows with status='contacted' back to 'won'
--      (contact_attempted_at is preserved as historical signal).
--   2. Redefine the auctions.status CHECK constraint without 'contacted'.
--   3. Patch soft_delete_user (Migration 072) so it no longer references
--      'contacted'. Keep all other behavior identical.
--   4. Application layer (APIs, UI) is updated separately.

BEGIN;

-- 1. Backfill: collapse contacted → won. contact_deadline is already NULL
--    on these rows (it was nulled when the user clicked the contact button),
--    so expire-contacts will not pick them up. They wait for the MD's
--    "방문 확인" → confirmed transition exactly like before.
UPDATE auctions
SET status = 'won'
WHERE status = 'contacted';

-- 2. Redefine CHECK constraint without 'contacted'.
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE auctions ADD CONSTRAINT auctions_status_check
  CHECK (status IN ('draft','scheduled','active','won','unsold','paid','confirmed','cancelled','expired'));

-- 3. soft_delete_user: drop 'contacted' from the active-state guards.
--    Function body is otherwise identical to Migration 072.
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

  IF v_user.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 탈퇴 처리된 계정입니다';
  END IF;

  -- 2. Admin 차단
  IF v_user.role = 'admin' THEN
    RAISE EXCEPTION '관리자 계정은 탈퇴할 수 없습니다';
  END IF;

  -- 3. MD 활성 경매 체크 ('contacted' 제거)
  IF v_user.role = 'md' THEN
    SELECT COUNT(*) INTO v_active_count
    FROM auctions
    WHERE md_id = p_user_id
      AND status IN ('active', 'scheduled', 'won');

    IF v_active_count > 0 THEN
      RAISE EXCEPTION '활성 경매 %건이 있어 탈퇴할 수 없습니다', v_active_count;
    END IF;
  END IF;

  -- 4. 진행 중인 낙찰 체크 ('contacted' 제거)
  SELECT COUNT(*) INTO v_won_count
  FROM auctions
  WHERE winner_id = p_user_id
    AND status = 'won';

  IF v_won_count > 0 THEN
    RAISE EXCEPTION '진행 중인 낙찰 %건이 있어 탈퇴할 수 없습니다', v_won_count;
  END IF;

  -- 5. Active bids 취소
  UPDATE bids SET status = 'cancelled'
  WHERE bidder_id = p_user_id AND status = 'active';

  -- 6. Soft Delete
  UPDATE users SET deleted_at = now() WHERE id = p_user_id;

  -- 7. 제재 기록이 있으면 블랙리스트에 저장
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

COMMENT ON FUNCTION soft_delete_user(UUID) IS 'Migration 086: contacted 상태 제거. won만 활성 낙찰로 간주.';

COMMIT;
