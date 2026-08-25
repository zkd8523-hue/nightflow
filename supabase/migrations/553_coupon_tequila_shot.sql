-- ============================================================================
-- Migration 553: 쿠폰 '데킬라샷' 혜택 추가
-- 날짜: 2026-08-25
-- 선행: 552_coupon_service_bottle.sql
--
-- 배경:
--   서비스 바틀(병 단위 증정)과 달리, 잔(샷) 단위로 소량 증정하는 혜택이 필요하다.
--   "병 통째로"가 아니라 "1인당 몇 잔"처럼 가벼운 증정이라 MD가 부담 없이
--   자주 쓸 수 있다. 서비스 바틀과 달리 최소구매 조건은 없다 — 샷 개수만
--   정해서 발행한다 (benefit_detail에 "N잔"으로 저장).
--
-- 이 마이그레이션이 하는 일:
--   1. benefit_type CHECK에 'tequila_shot' 추가 (coupon_issues / coupon_templates)
--   2. build_coupon_title()이 'tequila_shot'을 "데킬라샷"으로 표시
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

-- ============================================================================
-- 1) benefit_type CHECK에 tequila_shot 추가
--    552와 동일하게 이름을 알고 있는 제약은 IF EXISTS로 직접 지우고,
--    혹시 남아있을 다른 이름의 benefit_type 관련 CHECK도 청소한다.
-- ============================================================================
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  ALTER TABLE coupon_issues DROP CONSTRAINT IF EXISTS coupon_issues_benefit_type_chk;
  FOR v_conname IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'coupon_issues'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%benefit_type%'
  LOOP
    EXECUTE format('ALTER TABLE coupon_issues DROP CONSTRAINT %I', v_conname);
  END LOOP;
  ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_benefit_type_chk
    CHECK (benefit_type IN (
      'free_entry', 'free_drink', 'free_pass', 'liquor_set', 'table_discount',
      'service_bottle', 'tequila_shot', 'etc'
    ));

  ALTER TABLE coupon_templates DROP CONSTRAINT IF EXISTS coupon_templates_benefit_type_chk;
  FOR v_conname IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'coupon_templates'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%benefit_type%'
  LOOP
    EXECUTE format('ALTER TABLE coupon_templates DROP CONSTRAINT %I', v_conname);
  END LOOP;
  ALTER TABLE coupon_templates ADD CONSTRAINT coupon_templates_benefit_type_chk
    CHECK (benefit_type IN (
      'free_entry', 'free_drink', 'free_pass', 'liquor_set', 'table_discount',
      'service_bottle', 'tequila_shot', 'etc'
    ));
END $$;

-- ============================================================================
-- 2) 제목 생성 함수 — tequila_shot 라벨 추가 (시그니처는 552와 동일, CREATE OR REPLACE)
-- ============================================================================
CREATE OR REPLACE FUNCTION build_coupon_title(
  p_benefit_type    TEXT,
  p_discount_type   TEXT DEFAULT NULL,
  p_discount_amount INTEGER DEFAULT NULL,
  p_min_spend       INTEGER DEFAULT NULL,
  p_benefit_detail  TEXT DEFAULT NULL,
  p_min_spend_unit  TEXT DEFAULT 'krw'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_benefit TEXT;
  v_discount TEXT := '';
  v_prefix TEXT := '';
BEGIN
  -- 혜택 라벨 (프론트 COUPON_BENEFIT_PRESETS와 동일하게 유지할 것)
  v_benefit := CASE p_benefit_type
    WHEN 'free_entry'     THEN '무료입장'
    WHEN 'free_drink'     THEN '프리드링크'
    WHEN 'free_pass'      THEN '프리패스'
    WHEN 'liquor_set'     THEN '주류 세트 할인'
    WHEN 'table_discount' THEN '테이블 할인'
    WHEN 'service_bottle' THEN COALESCE(NULLIF(TRIM(p_benefit_detail), ''), '서비스 바틀')
    WHEN 'tequila_shot'   THEN COALESCE(NULLIF(TRIM(p_benefit_detail), ''), '데킬라샷')
    WHEN 'etc'            THEN COALESCE(NULLIF(TRIM(p_benefit_detail), ''), '특별 혜택')
    ELSE p_benefit_type
  END;

  -- 할인 문구
  IF p_discount_type = 'percent' AND p_discount_amount IS NOT NULL THEN
    v_discount := ' ' || p_discount_amount || '%';
  ELSIF p_discount_type = 'flat' AND p_discount_amount IS NOT NULL THEN
    IF p_discount_amount % 10000 = 0 THEN
      v_discount := ' ' || (p_discount_amount / 10000) || '만원';
    ELSE
      v_discount := ' ' || to_char(p_discount_amount, 'FM999,999,999') || '원';
    END IF;
  END IF;

  -- 최소 구매 조건 접두 — 단위에 따라 "2병 이상" / "5만원 이상"
  IF p_min_spend IS NOT NULL THEN
    IF p_min_spend_unit = 'bottle' THEN
      v_prefix := p_min_spend || '병 이상 ';
    ELSIF p_min_spend % 10000 = 0 THEN
      v_prefix := (p_min_spend / 10000) || '만원 이상 ';
    ELSE
      v_prefix := to_char(p_min_spend, 'FM999,999,999') || '원 이상 ';
    END IF;
  END IF;

  RETURN v_prefix || v_benefit || v_discount;
END;
$$;

COMMENT ON FUNCTION build_coupon_title(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) IS
  '혜택+할인으로 쿠폰 제목 자동 생성. tequila_shot은 benefit_detail("2잔")을 그대로 제목에 사용. Migration 553';

-- ============================================================================
-- 3) create_coupon_issue — benefit_detail 필수 대상에 tequila_shot 추가
--    (시그니처는 552와 동일, CREATE OR REPLACE)
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
  p_min_spend       INTEGER DEFAULT NULL,
  p_min_spend_unit  TEXT DEFAULT 'krw'
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

  IF p_benefit_type IN ('etc', 'service_bottle', 'tequila_shot')
     AND (p_benefit_detail IS NULL OR length(trim(p_benefit_detail)) = 0) THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE
        WHEN p_benefit_type = 'service_bottle' THEN '서비스 바틀은 상세 설명이 필요해요'
        WHEN p_benefit_type = 'tequila_shot' THEN '데킬라샷 잔 수를 선택해주세요'
        ELSE '기타 혜택은 상세 설명이 필요해요'
      END);
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

  -- tequila_shot은 최소 구매 조건이 없다 — 있으면 무시하지 않고 명시적으로 막는다
  -- (프론트가 이 타입에서 섹션 자체를 숨기므로 정상 흐름에선 항상 NULL로 온다).
  IF p_benefit_type = 'tequila_shot' AND p_min_spend IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '데킬라샷은 최소 구매 조건을 설정할 수 없어요');
  END IF;

  IF p_benefit_type <> 'tequila_shot' THEN
    IF p_min_spend_unit NOT IN ('krw', 'bottle') THEN
      RETURN jsonb_build_object('success', false, 'error', '최소 구매 조건 단위가 올바르지 않아요');
    END IF;
    -- 최소 구매 조건은 필수 (2026-08-25). 폼에서 "x만원/x병 이상 구매시"를 반드시 입력받는다.
    IF p_min_spend IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '최소 구매 조건을 입력해주세요');
    END IF;
    IF p_min_spend_unit = 'krw' AND (p_min_spend <= 0 OR p_min_spend > 100000000) THEN
      RETURN jsonb_build_object('success', false, 'error', '최소 구매금액을 확인해주세요');
    END IF;
    IF p_min_spend_unit = 'bottle' AND (p_min_spend < 1 OR p_min_spend > 20) THEN
      RETURN jsonb_build_object('success', false, 'error', '최소 구매 병 수는 1~20 사이로 입력해주세요');
    END IF;
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
    p_benefit_type, p_discount_type, p_discount_amount, p_min_spend, p_benefit_detail, p_min_spend_unit
  );

  INSERT INTO coupon_issues (
    club_id, md_id, benefit_type, benefit_tags, title, benefit_detail,
    conditions, thumbnail_url, total_count, redeem_ends_at,
    discount_type, discount_amount, min_spend, min_spend_unit
  )
  VALUES (
    p_club_id, v_md_id, p_benefit_type, COALESCE(p_benefit_tags, '{}'), v_title,
    NULLIF(TRIM(p_benefit_detail), ''),
    NULLIF(TRIM(p_conditions), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_total_count, p_redeem_ends_at,
    p_discount_type, p_discount_amount, p_min_spend, p_min_spend_unit
  )
  RETURNING id INTO v_id;

  -- 이 클럽을 찜한 유저들에게 새 쿠폰 알림 (Migration 551).
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

COMMENT ON FUNCTION create_coupon_issue(UUID, TEXT, TIMESTAMPTZ, INTEGER, TEXT[], TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) IS
  '쿠폰 발행 (본인/admin). 수량 최대 30장, 마감 최대 14일. tequila_shot은 min_spend 불가+benefit_detail 필수. Migration 553';
