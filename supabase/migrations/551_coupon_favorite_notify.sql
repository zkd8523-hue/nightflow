-- ============================================================================
-- Migration 551: 찜한 클럽에 새 쿠폰이 발행되면 알림
-- 날짜: 2026-08-25
-- 선행: 539, 543(알림 type CHECK), 544(create_coupon_issue 최신 본문), 546
--
-- 배경:
--   쿠폰 상세에 찜(하트)을 붙였는데, 정작 찜을 해도 새 쿠폰이 나올 때
--   아무 알림이 가지 않았다. create_coupon_issue()가 발행만 하고 끝나서
--   user_favorite_clubs를 조회하는 코드가 어디에도 없었다.
--   → 유저 입장에선 "찜을 왜 하는지" 알 수 없는 상태.
--
--   기존 인프라를 그대로 쓴다(신규 테이블·컬럼 없음):
--     - user_favorite_clubs (Migration 070)
--     - notify_user_push 6-arg (230/263/312) — 카테고리 토글·방해금지 자동 확인
--     - 선례: 326_guest_sign_open_push(대상자 순회 + 'marketing'),
--             159_notify_favorited_puzzle_promoted(찜한 유저에게 인앱 알림)
--
--   ⚠️ 푸시는 push_tokens에 토큰이 있는 유저(= 네이티브 앱 설치자)에게만 실제로
--      전달된다. 웹 전용 유저는 인앱 알림(종 아이콘)만 쌓인다 — 정상 동작이다.
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 알림 type 허용 목록에 'coupon_new_from_favorite' 추가
--    CHECK는 부분 수정이 불가능해 543의 목록 전체를 그대로 승계하고 한 줄만 늘린다.
-- ----------------------------------------------------------------------------
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
    'admin_visit_review_pending', 'admin_review_delete_request',
    'coupon_revoked',
    -- 신규 (551): 찜한 클럽에 새 쿠폰이 발행됨
    'coupon_new_from_favorite'
  ));

-- ----------------------------------------------------------------------------
-- 2) create_coupon_issue 재정의
--    544 본문 그대로 + 발행 직후 "찜한 유저 알림" 블록 하나만 추가.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_coupon_issue(
  p_club_id         UUID,
  p_benefit_type    TEXT,
  p_redeem_ends_at  TIMESTAMPTZ,
  p_total_count     INTEGER DEFAULT NULL,
  p_benefit_tags    TEXT[] DEFAULT '{}',
  p_benefit_detail  TEXT DEFAULT NULL,
  p_conditions      TEXT DEFAULT NULL,
  p_thumbnail_url   TEXT DEFAULT NULL,
  p_discount_type   TEXT DEFAULT NULL,
  p_discount_amount INTEGER DEFAULT NULL,
  p_min_spend       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_partner_exists BOOLEAN;
  v_has_passcode BOOLEAN;
  v_active_count INT;
  v_today_count INT;
  v_club_active_count INT;
  v_title TEXT;
  v_id UUID;
  v_fav RECORD;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role, coupon_passcode_hash IS NOT NULL
    INTO v_role, v_has_passcode
    FROM users WHERE id = v_md_id;

  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  IF NOT COALESCE(v_has_passcode, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '쿠폰 승인 비밀번호를 먼저 설정해주세요',
      'need_passcode', true
    );
  END IF;

  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  IF NOT v_is_admin AND NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너 MD가 아니에요');
    END IF;
  END IF;

  IF p_benefit_type = 'etc' AND (p_benefit_detail IS NULL OR length(trim(p_benefit_detail)) = 0) THEN
    RETURN jsonb_build_object('success', false, 'error', '기타 혜택은 상세 설명이 필요해요');
  END IF;

  IF p_benefit_tags IS NOT NULL AND array_length(p_benefit_tags, 1) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', '추가 태그는 최대 5개까지예요');
  END IF;

  IF p_redeem_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', '사용 마감 시각이 미래여야 해요');
  END IF;
  IF p_redeem_ends_at > now() + INTERVAL '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', '사용 마감은 최대 14일 이내로 설정해주세요');
  END IF;

  -- ★ 상한 30
  IF p_total_count IS NOT NULL AND (p_total_count <= 0 OR p_total_count > 30) THEN
    RETURN jsonb_build_object('success', false, 'error', '수량은 1~30장 사이로 설정해주세요');
  END IF;

  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('flat', 'percent') THEN
    RETURN jsonb_build_object('success', false, 'error', '할인 방식이 올바르지 않아요');
  END IF;
  IF (p_discount_type IS NULL) <> (p_discount_amount IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', '할인 값을 입력해주세요');
  END IF;
  IF p_discount_type = 'percent' AND (p_discount_amount < 1 OR p_discount_amount > 100) THEN
    RETURN jsonb_build_object('success', false, 'error', '할인율은 1~100% 사이로 입력해주세요');
  END IF;
  IF p_discount_type = 'flat' AND (p_discount_amount < 1 OR p_discount_amount > 10000000) THEN
    RETURN jsonb_build_object('success', false, 'error', '할인 금액을 확인해주세요');
  END IF;
  IF p_min_spend IS NOT NULL AND (p_min_spend <= 0 OR p_min_spend > 100000000) THEN
    RETURN jsonb_build_object('success', false, 'error', '최소 구매금액을 확인해주세요');
  END IF;

  IF NOT v_is_admin THEN
    SELECT COUNT(*) INTO v_active_count
      FROM coupon_issues
     WHERE md_id = v_md_id AND status IN ('active', 'sold_out');
    IF v_active_count >= 5 THEN
      RETURN jsonb_build_object('success', false, 'error', '동시 발행 가능한 쿠폰은 최대 5건이에요', 'limit_kind', 'md_active');
    END IF;

    SELECT COUNT(*) INTO v_today_count
      FROM coupon_issues
     WHERE md_id = v_md_id
       AND created_at > now() - INTERVAL '24 hours'
       AND status <> 'cancelled';
    IF v_today_count >= 5 THEN
      RETURN jsonb_build_object('success', false, 'error', '하루에 발행 가능한 쿠폰은 최대 5건이에요', 'limit_kind', 'md_daily');
    END IF;

    SELECT COUNT(*) INTO v_club_active_count
      FROM coupon_issues
     WHERE club_id = p_club_id AND status IN ('active', 'sold_out');
    IF v_club_active_count >= 10 THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽에 동시 발행 가능한 쿠폰은 최대 10건이에요', 'limit_kind', 'club_active');
    END IF;
  END IF;

  v_title := build_coupon_title(
    p_benefit_type, p_discount_type, p_discount_amount, p_min_spend, p_benefit_detail
  );

  INSERT INTO coupon_issues (
    club_id, md_id, benefit_type, benefit_tags, title, benefit_detail,
    conditions, thumbnail_url, total_count, redeem_ends_at,
    discount_type, discount_amount, min_spend
  )
  VALUES (
    p_club_id, v_md_id, p_benefit_type, COALESCE(p_benefit_tags, '{}'), v_title,
    NULLIF(TRIM(p_benefit_detail), ''),
    NULLIF(TRIM(p_conditions), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_total_count, p_redeem_ends_at,
    p_discount_type, p_discount_amount, p_min_spend
  )
  RETURNING id INTO v_id;

  -- 이 클럽을 찜한 유저들에게 새 쿠폰 알림 (Migration 551).
  -- 카테고리 'marketing' — notify_user_push 6-arg 오버로드가 notify_marketing 토글과
  -- 방해금지 시간대를 알아서 확인한다(Migration 230/263/312).
  -- 알림 실패가 쿠폰 발행 자체를 막으면 안 되므로 EXCEPTION으로 격리한다
  -- (543의 cancel_coupon_issue에서 CHECK 위반으로 취소가 통째로 롤백된 전례).
  BEGIN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    SELECT ufc.user_id,
           'coupon_new_from_favorite',
           '찜한 클럽에 새 쿠폰이 떴어요',
           v_title || ' · ' || COALESCE((SELECT name FROM clubs WHERE id = p_club_id), ''),
           '/coupons/' || v_id::TEXT
      FROM user_favorite_clubs ufc
     WHERE ufc.club_id = p_club_id;

    FOR v_fav IN
      SELECT ufc.user_id
        FROM user_favorite_clubs ufc
        JOIN users u ON u.id = ufc.user_id
       WHERE ufc.club_id = p_club_id
         AND u.deleted_at IS NULL
    LOOP
      PERFORM notify_user_push(
        v_fav.user_id,
        '🎟️ 찜한 클럽에 새 쿠폰이 떴어요',
        v_title,
        jsonb_build_object('type', 'coupon_new_from_favorite', 'coupon_id', v_id::TEXT),
        '/coupons/' || v_id::TEXT,
        'marketing'
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'create_coupon_issue: favorite notify failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'title', v_title);
END;
$$;

COMMENT ON FUNCTION create_coupon_issue(UUID, TEXT, TIMESTAMPTZ, INTEGER, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  '쿠폰 발행 (본인/admin). 수량 최대 30장, 마감 최대 14일. 발행 시 이 클럽을 찜한 유저에게 인앱+푸시 알림(marketing, Migration 551)';
