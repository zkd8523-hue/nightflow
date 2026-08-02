-- ============================================================================
-- Migration 492: 리뷰 삭제 요청 + 어드민 승인
-- 날짜: 2026-07-20
-- 설명:
--   파트너(리뷰 대상)가 부당한 리뷰의 삭제를 요청할 수 있게 한다. 단, 요청만으로는
--   사라지지 않는다 — 리뷰는 그대로 노출된 채 delete_requested_at 만 찍히고,
--   어드민이 검토 후 승인해야 실제로 숨겨진다(status='rejected'). 파트너가 나쁜
--   리뷰를 즉시 숨기는 악용을 막기 위함.
--
--   흐름:
--     파트너 request_review_deletion(사유) → delete_requested_at 세팅 + 어드민 알림
--     어드민 resolve_review_deletion(approve):
--        approve=true  → status='rejected' (프로필에서 사라짐, 평점 재계산)
--        approve=false → delete_requested_at 클리어 (리뷰 유지)
-- ============================================================================

-- 0) in_app_notifications 알림 타입 확장 (491의 방문리뷰 + 492의 삭제요청)
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;
ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
    'md_approved', 'md_rejected', 'outbid', 'auction_won',
    'contact_deadline_warning', 'noshow_penalty', 'fallback_won',
    'feedback_request', 'md_grade_change', 'cancellation_confirmed',
    'contact_expired_no_fault', 'contact_expired_user_attempted',
    'md_winner_cancelled', 'md_winner_noshow', 'md_new_bid',
    'md_noshow_review', 'noshow_dismissed',
    'puzzle_seat_adjusted', 'puzzle_cancelled',
    'puzzle_offer_received', 'puzzle_offer_accepted', 'puzzle_offer_rejected',
    'puzzle_leader_changed', 'puzzle_member_joined',
    'puzzle_visit_pending', 'puzzle_visit_confirmed',
    'puzzle_promoted_to_flag',
    'offer_withdrawn_by_admin',
    'admin_puzzle_expired', 'admin_puzzle_cancelled',
    'admin_match_expired', 'admin_match_cancelled',
    'chat_reply',
    'party_md_invited', 'party_removed', 'party_md_released',
    'dm_request', 'dm_accepted',
    'credit_charged',
    -- 신규 (491/492): 방문 리뷰 검토 + 삭제 요청
    'admin_visit_review_pending', 'admin_review_delete_request'
  ));

-- 1) 삭제 요청 컬럼
ALTER TABLE puzzle_reviews
  ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- 2) get_md_reviews 재정의 — reviewer_id + delete_requested_at 포함
--    (반환 컬럼이 바뀌므로 DROP 후 재생성)
DROP FUNCTION IF EXISTS get_md_reviews(UUID, INT, INT);
CREATE FUNCTION get_md_reviews(
  p_md_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  rating INT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  club_name TEXT,
  reviewer_id UUID,
  reviewer_display_name TEXT,
  reviewer_profile_image TEXT,
  delete_requested_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.rating, r.comment, r.tags, r.created_at,
    c.name AS club_name,
    r.leader_id AS reviewer_id,
    COALESCE(u.display_name, '익명') AS reviewer_display_name,
    u.profile_image AS reviewer_profile_image,
    r.delete_requested_at
  FROM puzzle_reviews r
  LEFT JOIN clubs c ON c.id = r.club_id
  LEFT JOIN users u ON u.id = r.leader_id
  WHERE r.md_id = p_md_id AND r.status = 'approved'
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50))
  OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION get_md_reviews(UUID, INT, INT) TO anon, authenticated;

-- 3) 파트너의 삭제 요청 (리뷰 대상 본인만)
CREATE OR REPLACE FUNCTION request_review_deletion(
  p_review_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_rev RECORD;
  v_admin RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT id, md_id, status INTO v_rev FROM puzzle_reviews WHERE id = p_review_id;
  IF v_rev IS NULL THEN
    RETURN json_build_object('success', false, 'error', '리뷰를 찾을 수 없어요');
  END IF;
  IF v_rev.md_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인에게 달린 리뷰만 요청할 수 있어요');
  END IF;
  IF v_rev.status <> 'approved' THEN
    RETURN json_build_object('success', false, 'error', '노출 중인 리뷰만 삭제 요청할 수 있어요');
  END IF;

  UPDATE puzzle_reviews
  SET delete_requested_at = now(),
      delete_reason = NULLIF(TRIM(p_reason), ''),
      updated_at = now()
  WHERE id = p_review_id;

  FOR v_admin IN SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LOOP
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (v_admin.id, 'admin_review_delete_request', '[관리자] 리뷰 삭제 요청',
            '파트너가 리뷰 삭제를 요청했어요. 검토해주세요.', '/admin/visit-reviews');
  END LOOP;

  -- 어드민 FCM 푸시 (Vault 인증, Migration 311)
  PERFORM notify_admins_push(
    '리뷰 삭제 요청',
    '파트너가 리뷰 삭제를 요청했어요. 검토해주세요.',
    jsonb_build_object('type', 'admin_review_delete_request', 'review_id', p_review_id::TEXT, 'url', '/admin/visit-reviews')
  );

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION request_review_deletion(UUID, TEXT) TO authenticated;

-- 4) 어드민 처리 (승인=숨김 / 반려=유지)
CREATE OR REPLACE FUNCTION resolve_review_deletion(
  p_review_id UUID,
  p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_uid := auth.uid();
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN json_build_object('success', false, 'error', '관리자만 가능해요');
  END IF;

  IF p_approve THEN
    -- 삭제 승인 → 숨김 처리 (기록 보존 위해 실제 DELETE 대신 rejected). 트리거가 평점 재계산.
    UPDATE puzzle_reviews
    SET status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
    WHERE id = p_review_id;
  ELSE
    -- 삭제 반려 → 요청 취소, 리뷰 유지
    UPDATE puzzle_reviews
    SET delete_requested_at = NULL, delete_reason = NULL, updated_at = now()
    WHERE id = p_review_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION resolve_review_deletion(UUID, BOOLEAN) TO authenticated;

-- 5) 어드민 삭제 요청 목록
CREATE OR REPLACE FUNCTION admin_list_review_deletion_requests()
RETURNS TABLE (
  id UUID,
  rating INT,
  comment TEXT,
  tags TEXT[],
  delete_reason TEXT,
  delete_requested_at TIMESTAMPTZ,
  md_id UUID,
  md_name TEXT,
  md_instagram TEXT,
  club_name TEXT,
  reviewer_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.rating, r.comment, r.tags, r.delete_reason, r.delete_requested_at,
    r.md_id, md.display_name, md.instagram, c.name, lu.display_name
  FROM puzzle_reviews r
  LEFT JOIN users md ON md.id = r.md_id
  LEFT JOIN users lu ON lu.id = r.leader_id
  LEFT JOIN clubs c ON c.id = r.club_id
  WHERE r.status = 'approved' AND r.delete_requested_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ORDER BY r.delete_requested_at ASC;
$$;
GRANT EXECUTE ON FUNCTION admin_list_review_deletion_requests() TO authenticated;
