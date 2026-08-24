-- ============================================================================
-- Migration 540: 쿠폰 할인 필드 + 제목 자동생성 + 사용화면 티켓 데이터
-- 날짜: 2026-08-24
-- 선행: 539_partner_coupons.sql
--
-- 배경:
--   539의 쿠폰은 benefit_type 6종 + benefit_tags로만 혜택을 표현한다.
--   "테이블 30% 할인", "50만원 이상 20% 할인" 같은 실제 MD 문구를 구조화된
--   값으로 담을 수 없어 카드 자동 표시·필터·통계가 불가능했다.
--
-- 이 마이그레이션이 하는 일:
--   1. coupon_issues에 할인 3종 추가 (discount_type / discount_amount / min_spend)
--   2. title을 폼에서 제거 → 서버가 혜택+할인으로 자동 생성 (컬럼은 NOT NULL 유지)
--   3. get_coupon_redeem_view가 클럽/할인/조건을 조인해 반환 (티켓 UI용)
--
-- 설계 결정:
--   - 할인은 발행 후 수정 불가. benefit_type과 동일하게 불변으로 둔다.
--     유저가 "20% 할인"을 받았는데 나중에 5%로 바뀌는 걸 원천 차단한다.
--     → coupon_claims에 할인 스냅샷 컬럼이 불필요하다 (issue를 그대로 참조).
--   - benefit_type 6종은 그대로. discount_flat/discount_percent를 새 종류로
--     만들면 "주류세트할인 20%" 같은 조합을 표현할 수 없다.
--   - discount_amount는 flat일 때 '원' 단위 정수. 폼은 만원 단위로 받아
--     클라이언트에서 *10000 해서 보낸다 (조각/경매 폼과 동일한 레포 관례).
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

-- ============================================================================
-- 1) 할인 컬럼 추가
-- ============================================================================
ALTER TABLE coupon_issues
  ADD COLUMN IF NOT EXISTS discount_type   TEXT,      -- NULL = 할인 없음
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER,   -- flat=원 단위 / percent=1~100
  ADD COLUMN IF NOT EXISTS min_spend       INTEGER;   -- 원 단위, NULL = 조건 없음

-- ⚠️ 539의 기존 CHECK는 전부 익명(coupon_issues_check, _check1...)이라 나중에
--    DROP이 어렵다. 같은 실수를 반복하지 않기 위해 여기서는 전부 이름을 붙인다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupon_issues_discount_type_chk') THEN
    ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_discount_type_chk
      CHECK (discount_type IS NULL OR discount_type IN ('flat', 'percent'));
  END IF;

  -- type과 amount는 항상 함께 있거나 함께 없어야 한다
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupon_issues_discount_pair_chk') THEN
    ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_discount_pair_chk
      CHECK ((discount_type IS NULL) = (discount_amount IS NULL));
  END IF;

  -- percent는 1~100, flat은 1원~1000만원.
  -- 상한은 integer 오버플로 방어 (ShareLiveToggleList의 "integer out of range" 선례)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupon_issues_discount_amount_chk') THEN
    ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_discount_amount_chk
      CHECK (
        discount_amount IS NULL
        OR (discount_type = 'percent' AND discount_amount BETWEEN 1 AND 100)
        OR (discount_type = 'flat'    AND discount_amount BETWEEN 1 AND 10000000)
      );
  END IF;

  -- min_spend는 discount_type 없이 단독으로도 허용한다.
  -- "50만원 이상 테이블 예약 시 무료입장" 같은 조합이 성립하므로 쌍 제약을 걸지 않는다.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupon_issues_min_spend_chk') THEN
    ALTER TABLE coupon_issues ADD CONSTRAINT coupon_issues_min_spend_chk
      CHECK (min_spend IS NULL OR (min_spend > 0 AND min_spend <= 100000000));
  END IF;
END $$;

COMMENT ON COLUMN coupon_issues.discount_type IS 'flat=정액(원) / percent=정률(%) / NULL=할인 없음. 발행 후 수정 불가';
COMMENT ON COLUMN coupon_issues.discount_amount IS 'flat이면 원 단위, percent면 1~100. 폼은 만원 단위로 받아 클라이언트가 *10000';
COMMENT ON COLUMN coupon_issues.min_spend IS '최소 구매금액(원). discount 없이 단독 사용 가능';

-- ============================================================================
-- 2) 제목 자동 생성 함수
--    "제목" 입력란을 폼에서 없앴다. 혜택 라벨 아래 제목이 또 나오는 건 중복이고,
--    할인 정보가 붙으면 그게 곧 제목 역할을 한다.
--    단 title 컬럼은 NOT NULL로 유지한다 — 알림 메시지·SEO metadata·취소 알림이
--    이미 title을 참조하고 있고, 컬럼을 지우면 기존 발행분 제목도 사라진다.
-- ============================================================================
CREATE OR REPLACE FUNCTION build_coupon_title(
  p_benefit_type    TEXT,
  p_discount_type   TEXT DEFAULT NULL,
  p_discount_amount INTEGER DEFAULT NULL,
  p_min_spend       INTEGER DEFAULT NULL,
  p_benefit_detail  TEXT DEFAULT NULL
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

  -- 최소 구매금액 접두
  IF p_min_spend IS NOT NULL THEN
    IF p_min_spend % 10000 = 0 THEN
      v_prefix := (p_min_spend / 10000) || '만원 이상 ';
    ELSE
      v_prefix := to_char(p_min_spend, 'FM999,999,999') || '원 이상 ';
    END IF;
  END IF;

  RETURN v_prefix || v_benefit || v_discount;
END;
$$;

COMMENT ON FUNCTION build_coupon_title(TEXT, TEXT, INTEGER, INTEGER, TEXT) IS
  '혜택+할인으로 쿠폰 제목 자동 생성. 예: "50만원↑ 테이블 할인 20%"';

-- ============================================================================
-- 3) create_coupon_issue 재정의 (9-arg → 11-arg)
--    ⚠️ CREATE OR REPLACE만으로는 파라미터를 추가할 수 없다. Postgres는 시그니처가
--    다르면 새 함수로 만들고, 구/신 두 버전이 공존하면 PostgREST가
--    PGRST203 "Could not choose the best candidate function"으로 실패한다.
--    이 레포는 같은 사고를 이미 4번 겪었다 (166, 310, 334, 362).
--    → 반드시 기존 시그니처를 정확히 명시해 DROP한다.
--
--    p_title은 파라미터에서 제거한다 (폼에서 없앰). 서버가 자동 생성한다.
-- ============================================================================
DROP FUNCTION IF EXISTS create_coupon_issue(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT[], TEXT, TEXT, TEXT);

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
SET search_path = public
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_partner_exists BOOLEAN;
  v_active_count INT;
  v_today_count INT;
  v_club_active_count INT;
  v_title TEXT;
  v_id UUID;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

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

  -- 할인 검증
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

  -- 남발 방지 상한 (admin은 우회 — 운영 배정/테스트 목적)
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

  -- 제목 자동 생성
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
  '쿠폰 발행 (MD/admin). 제목은 혜택+할인으로 자동 생성. 할인은 발행 후 수정 불가';

-- ============================================================================
-- 4) update_coupon_issue 재정의
--    할인 파라미터는 추가하지 않는다 (발행 후 수정 불가 결정).
--    p_title도 제거 — 제목은 자동 생성이므로 수동 수정 대상이 아니다.
--    DROP했으므로 반드시 재생성해야 한다.
-- ============================================================================
DROP FUNCTION IF EXISTS update_coupon_issue(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ);

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
  IF p_total_count IS NOT NULL AND p_total_count > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', '수량은 최대 300장이에요');
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
  '쿠폰 수정 (본인/admin). benefit_type·할인·제목은 불변, 마감 연장만, 수량 하향은 claimed_count 이상만';

-- ============================================================================
-- 5) get_coupon_redeem_view 재정의 — 티켓 UI에 필요한 데이터 조인
--    사용 화면은 MD가 눈으로 보고 판단하는 화면이다. 그런데 기존 구현은
--    coupon_claims 한 행만 반환해서 클럽명·사용조건·할인이 전혀 안 왔다.
--    MD가 "우리 클럽 쿠폰이 맞는지", "23시 이전 입장 조건을 지켰는지"를
--    확인할 수 없으면 화면만 보고 판단한다는 설계가 성립하지 않는다.
--
--    시그니처는 (UUID)로 동일하므로 CREATE OR REPLACE로 충분하다.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_coupon_redeem_view(p_claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row coupon_claims%ROWTYPE;
  v_issue coupon_issues%ROWTYPE;
  v_club_name TEXT;
  v_club_area TEXT;
  v_club_thumb TEXT;
  v_md_name TEXT;
  v_md_image TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT * INTO v_row FROM coupon_claims WHERE id = p_claim_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = v_row.issue_id;

  SELECT name, area, thumbnail_url
    INTO v_club_name, v_club_area, v_club_thumb
    FROM clubs WHERE id = v_row.club_id;

  -- 발행자(MD). users 직접 조인은 533/537 RLS 락다운 때문에 금지 — 공개 뷰를 쓴다.
  SELECT display_name, profile_image
    INTO v_md_name, v_md_image
    FROM public_user_profiles WHERE id = v_issue.md_id;

  RETURN jsonb_build_object(
    'success', true,
    'claim', to_jsonb(v_row) || jsonb_build_object(
      'club_name',       v_club_name,
      'club_area',       v_club_area,
      'club_thumbnail',  COALESCE(v_issue.thumbnail_url, v_club_thumb),
      'conditions',      v_issue.conditions,
      'benefit_detail',  v_issue.benefit_detail,
      'benefit_tags',    COALESCE(v_issue.benefit_tags, '{}'),
      'discount_type',   v_issue.discount_type,
      'discount_amount', v_issue.discount_amount,
      'min_spend',       v_issue.min_spend,
      'md_name',         v_md_name,
      'md_image',        v_md_image
    ),
    'server_now', now()
  );
END;
$$;

COMMENT ON FUNCTION get_coupon_redeem_view(UUID) IS
  '쿠폰 사용 화면(티켓 UI)용 조회. 클럽·할인·사용조건을 조인해 반환. server_now로 클라 시계 오프셋 보정';

-- ============================================================================
-- 6) 기존 발행분 제목 정규화 (선택)
--    539로 발행된 쿠폰은 MD가 손으로 적은 제목을 갖고 있다. 그대로 두면
--    새 쿠폰과 표기가 섞이므로, 할인 정보가 없는 기존 건들의 제목을
--    혜택 라벨 기준으로 통일한다.
--    ⚠️ MD가 의미 있게 적은 제목이 있을 수 있으므로 자동 실행하지 않는다.
--       필요하면 아래 주석을 풀어 수동 실행할 것.
-- ============================================================================
-- UPDATE coupon_issues
--    SET title = build_coupon_title(benefit_type, discount_type, discount_amount, min_spend, benefit_detail)
--  WHERE status IN ('active', 'sold_out');
