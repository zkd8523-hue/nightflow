-- ============================================================================
-- Migration 544: 쿠폰 1건당 재고 상한 300 → 30
-- 날짜: 2026-08-24
-- 선행: 539, 540, 541, 543
--
-- 함께 수정:
--   일일 발행 한도(5건)가 '취소된 쿠폰'까지 세고 있어, 잘못 발행해 취소하면
--   그날 다시 만들 수 없었다. 취소분은 재고를 점유하지 않으므로 제외한다.
--
-- 배경:
--   539에서 상한을 300으로 잡았으나 실제 운영 단위에 비해 과했다.
--   MD 한 명이 하룻밤에 소화할 수 있는 규모가 아니고, 재고가 크면
--   수집벽 유저가 잠가둘 여지도 커진다. 30으로 낮춘다.
--
-- ⚠️ 이미 30장을 넘겨 발행된 건이 있으면 CHECK 추가가 실패한다.
--    (2026-08-24 확인: 해당 없음)
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

-- 539의 익명 CHECK(coupon_issues_check…)에 total_count <= 300이 들어 있다.
-- 익명이라 개별 DROP이 어려우므로, 상한만 다시 좁히는 명명 제약을 덧붙인다.
-- (두 제약이 AND로 걸려 실질 상한은 30이 된다)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupon_issues_total_count_max30_chk') THEN
    ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_total_count_max30_chk
      CHECK (total_count IS NULL OR total_count <= 30);
  END IF;
END $$;

-- ============================================================================
-- create_coupon_issue — 가드 문구/값을 30으로 (시그니처는 541과 동일)
-- ============================================================================
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

  RETURN jsonb_build_object('success', true, 'id', v_id, 'title', v_title);
END;
$$;

COMMENT ON FUNCTION create_coupon_issue(UUID, TEXT, TIMESTAMPTZ, INTEGER, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  '쿠폰 발행 (MD/admin). 승인 비밀번호 필수, 재고 최대 30장. 제목은 혜택+할인으로 자동 생성';

-- ============================================================================
-- update_coupon_issue — 수량 상한만 30으로 (시그니처는 540과 동일)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_coupon_issue(
  p_id             UUID,
  p_benefit_tags   TEXT[] DEFAULT NULL,
  p_benefit_detail TEXT DEFAULT NULL,
  p_conditions     TEXT DEFAULT NULL,
  p_thumbnail_url  TEXT DEFAULT NULL,
  p_total_count    INTEGER DEFAULT NULL,
  p_redeem_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_issue coupon_issues%ROWTYPE;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;
  IF v_issue.md_id <> v_md_id AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 수정할 수 있어요');
  END IF;
  IF v_issue.status NOT IN ('active', 'sold_out') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 쿠폰은 수정할 수 없어요');
  END IF;

  IF p_total_count IS NOT NULL AND p_total_count < v_issue.claimed_count THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 나간 수량보다 적게 설정할 수 없어요');
  END IF;
  IF p_total_count IS NOT NULL AND p_total_count > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', '수량은 최대 30장이에요');
  END IF;

  IF p_redeem_ends_at IS NOT NULL AND p_redeem_ends_at < v_issue.redeem_ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', '사용 마감은 연장만 가능해요');
  END IF;
  IF p_redeem_ends_at IS NOT NULL AND p_redeem_ends_at > now() + INTERVAL '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', '사용 마감은 최대 14일 이내로 설정해주세요');
  END IF;

  IF p_benefit_tags IS NOT NULL AND array_length(p_benefit_tags, 1) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', '추가 태그는 최대 5개까지예요');
  END IF;

  UPDATE coupon_issues
     SET benefit_tags   = COALESCE(p_benefit_tags, benefit_tags),
         benefit_detail = CASE WHEN p_benefit_detail IS NULL THEN benefit_detail ELSE NULLIF(TRIM(p_benefit_detail), '') END,
         conditions     = CASE WHEN p_conditions IS NULL THEN conditions ELSE NULLIF(TRIM(p_conditions), '') END,
         thumbnail_url  = CASE WHEN p_thumbnail_url IS NULL THEN thumbnail_url ELSE NULLIF(TRIM(p_thumbnail_url), '') END,
         total_count    = COALESCE(p_total_count, total_count),
         redeem_ends_at = COALESCE(p_redeem_ends_at, redeem_ends_at),
         status         = CASE
                             WHEN status = 'sold_out'
                              AND p_total_count IS NOT NULL AND p_total_count > claimed_count
                             THEN 'active'
                             ELSE status
                           END
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_coupon_issue(UUID, TEXT[], TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ) IS
  '쿠폰 수정 (본인/admin). benefit_type·할인·제목은 불변, 마감 연장만, 수량 최대 30장';
