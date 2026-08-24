-- ============================================================================
-- Migration 541: 쿠폰 사용 승인 비밀번호 (MD별 공통 4자리)
-- 날짜: 2026-08-24
-- 선행: 539_partner_coupons.sql, 540_coupon_discount_and_ticket.sql
--
-- 배경:
--   기존 사용 처리는 "길게 눌러 사용하기"였다. 유저 혼자서 아무 데서나 누를 수
--   있으므로 MD가 실제로 그 자리에 있었는지를 전혀 보장하지 못한다.
--   화면 위조 방지 장치(실시간 전광판)는 "스크린샷이 아님"만 증명할 뿐,
--   "MD 앞에서 사용했음"은 증명하지 못한다.
--
--   → 유저가 사용 버튼을 누르면 MD가 4자리 비밀번호를 입력해야 처리된다.
--     MD만 아는 값이므로 MD의 물리적 개입이 강제된다.
--
-- 설계 결정:
--   - MD별 공통 1개. 쿠폰마다 다르면 MD가 현장에서 어느 번호인지 헷갈린다.
--   - 발행 시 필수. 비밀번호 없는 쿠폰은 사용 자체가 불가능해지므로 원천 차단.
--   - ⚠️ 평문 저장 금지. pgcrypto bcrypt로 해시하고 검증은 서버에서만 한다.
--     클라이언트로 비밀번호(해시 포함)가 절대 내려가지 않도록 users의 SELECT
--     경로에 노출하지 않는다 (public_user_profiles에도 넣지 않는다).
--   - 무차별 대입 방어: 실패 횟수를 claim에 누적해 5회 초과 시 잠근다.
--     쿠폰 1장당 카운트이므로 정상 사용자가 잠길 위험은 사실상 없다.
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

-- ⚠️ Supabase는 pgcrypto를 public이 아닌 extensions 스키마에 설치한다.
--    그래서 SET search_path = public 만으로는 gen_salt/crypt를 찾지 못하고
--    "function gen_salt(unknown) does not exist"가 난다.
--    → 아래 함수들은 search_path에 extensions를 함께 넣는다.
DO $ext$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  END IF;
END $ext$;

-- ============================================================================
-- 1) 컬럼 추가
-- ============================================================================

-- MD 승인 비밀번호 (bcrypt 해시). 평문은 어디에도 저장하지 않는다.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coupon_passcode_hash TEXT;

COMMENT ON COLUMN users.coupon_passcode_hash IS
  '쿠폰 사용 승인용 4자리 비밀번호의 bcrypt 해시. 절대 클라이언트에 노출 금지 (RPC 검증 전용)';

-- 무차별 대입 방어용 실패 카운터
ALTER TABLE coupon_claims
  ADD COLUMN IF NOT EXISTS redeem_fail_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN coupon_claims.redeem_fail_count IS
  '비밀번호 오입력 누적 횟수. 5회 초과 시 해당 쿠폰의 사용 시도를 잠근다';

-- ============================================================================
-- 2) set_coupon_passcode — MD가 본인 비밀번호 설정/변경
--    4자리 숫자만 허용. 저장은 해시로만.
-- ============================================================================
CREATE OR REPLACE FUNCTION set_coupon_passcode(p_passcode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_uid;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;

  IF p_passcode IS NULL OR p_passcode !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', '숫자 4자리로 입력해주세요');
  END IF;

  UPDATE users
     SET coupon_passcode_hash = crypt(p_passcode, gen_salt('bf'))
   WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION set_coupon_passcode(TEXT) IS
  'MD 쿠폰 승인 비밀번호 설정 (4자리 숫자, bcrypt 해시 저장)';

-- ============================================================================
-- 3) has_coupon_passcode — 설정 여부만 확인 (해시 자체는 절대 반환하지 않음)
-- ============================================================================
CREATE OR REPLACE FUNCTION has_coupon_passcode()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_has BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT coupon_passcode_hash IS NOT NULL INTO v_has FROM users WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'has_passcode', COALESCE(v_has, false));
END;
$$;

COMMENT ON FUNCTION has_coupon_passcode() IS
  'MD 본인의 쿠폰 비밀번호 설정 여부. 해시 값은 반환하지 않는다';

-- ============================================================================
-- 4) create_coupon_issue — 비밀번호 미설정 시 발행 차단
--    시그니처는 540과 동일하므로 CREATE OR REPLACE로 충분하다.
--    (본문에 가드 1개만 추가)
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

  -- ★ 비밀번호 없이 발행하면 아무도 사용할 수 없는 쿠폰이 된다. 원천 차단.
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

  IF p_total_count IS NOT NULL AND (p_total_count <= 0 OR p_total_count > 300) THEN
    RETURN jsonb_build_object('success', false, 'error', '수량은 1~300장 사이로 설정해주세요');
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
     WHERE md_id = v_md_id AND created_at > now() - INTERVAL '24 hours';
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
  '쿠폰 발행 (MD/admin). 승인 비밀번호 필수. 제목은 혜택+할인으로 자동 생성';

-- ============================================================================
-- 5) redeem_coupon — 비밀번호 검증 추가 (1-arg → 2-arg)
--    ⚠️ 파라미터가 늘어나므로 반드시 기존 시그니처를 DROP한다.
--    (166/310/334/362에서 겪은 PGRST203 오버로드 충돌 방지)
-- ============================================================================
DROP FUNCTION IF EXISTS redeem_coupon(UUID);

CREATE OR REPLACE FUNCTION redeem_coupon(p_claim_id UUID, p_passcode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_nonce TEXT;
  v_color SMALLINT;
  v_row coupon_claims%ROWTYPE;
  v_issue coupon_issues%ROWTYPE;
  v_hash TEXT;
  v_fail INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT * INTO v_row FROM coupon_claims WHERE id = p_claim_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;

  -- 상태 선검증 (비밀번호를 맞춰도 못 쓰는 건을 먼저 걸러 실패 카운트 낭비를 막는다)
  IF v_row.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 사용한 쿠폰이에요', 'redeemed_at', v_row.redeemed_at);
  ELSIF v_row.status = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'error', '발행이 취소된 쿠폰이에요');
  ELSIF v_row.status <> 'active' OR v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', '만료된 쿠폰이에요');
  END IF;

  -- 무차별 대입 방어
  IF v_row.redeem_fail_count >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '비밀번호를 여러 번 틀렸어요. MD에게 문의해주세요',
      'locked', true
    );
  END IF;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = v_row.issue_id;
  SELECT coupon_passcode_hash INTO v_hash FROM users WHERE id = v_issue.md_id;

  IF v_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '발행자가 승인 비밀번호를 설정하지 않았어요');
  END IF;

  IF p_passcode IS NULL OR crypt(p_passcode, v_hash) <> v_hash THEN
    UPDATE coupon_claims
       SET redeem_fail_count = redeem_fail_count + 1
     WHERE id = p_claim_id
    RETURNING redeem_fail_count INTO v_fail;

    RETURN jsonb_build_object(
      'success', false,
      'error', '비밀번호가 달라요',
      'remaining_tries', GREATEST(0, 5 - v_fail)
    );
  END IF;

  -- 6자리 대조용 코드 (혼동 문자 I,O,0,1,l,o 제외) + 화면 색 인덱스
  v_nonce := upper(substr(translate(encode(gen_random_bytes(8), 'base64'),
                                    '+/=IO01lo', ''), 1, 6));
  v_color := (floor(random() * 6))::SMALLINT;

  UPDATE coupon_claims
     SET redeemed_at  = now(),
         redeem_nonce = v_nonce,
         redeem_color = v_color,
         status       = 'redeemed'
   WHERE id = p_claim_id
     AND user_id = v_user_id
     AND status = 'active'
     AND redeemed_at IS NULL          -- ★ 동시 요청 중 하나만 성공
     AND expires_at > now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 사용한 쿠폰이에요');
  END IF;

  UPDATE coupon_issues SET redeemed_count = redeemed_count + 1 WHERE id = v_row.issue_id;

  RETURN jsonb_build_object(
    'success', true,
    'redeemed_at', v_row.redeemed_at,
    'nonce', v_nonce,
    'color', v_color,
    'server_now', now()
  );
END;
$$;

COMMENT ON FUNCTION redeem_coupon(UUID, TEXT) IS
  '쿠폰 사용 처리. MD 4자리 비밀번호 검증 + redeemed_at IS NULL 조건부 UPDATE로 중복사용 방지';
