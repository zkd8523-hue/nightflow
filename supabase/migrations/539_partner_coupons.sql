-- ============================================================================
-- Migration 539: 파트너(MD) 쿠폰 — 발행(issue) / 보유(claim) / 사용(redeem) 3단
-- 날짜: 2026-08-24
-- 설명:
--   MD가 클럽 단위 혜택 쿠폰을 발행 → 유저가 다운로드(선착순/사용마감) →
--   현장에서 유저가 본인 화면에서 직접 '사용하기' → 소멸.
--   QR/스캐너 없음 (클럽 내부는 어둡고 시끄러워 스캔이 더 느림). MD는 유저 화면을
--   눈으로만 보고 확인 — 화면은 실시간 시계+워터마크로 스크린샷과 구분됨(프론트).
--
-- 설계 원칙 (434 실패 이력 반영):
--   434에서 스탬프/리워드를 폐기한 이유는 "적립 행위가 무한 반복 가능하고,
--   보상이 발행자와 무관한 공용 풀에서 나왔다" — 즉 범용 화폐형 구조였다는 것.
--   쿠폰은 화폐가 아니라 티켓이다:
--     - 누적/잔액 개념 없음. 잔액 없음. 교환 카탈로그 없음.
--     - 재고는 발행 MD의 유한 재고(claimed_count/total_count)에 묶인다.
--     - 가치 실현 지점이 반드시 오프라인 대면 순간(사용 처리)에 고정된다.
--     - 유저 다운로드 한도는 1발행물당 1장뿐 — 총량 제한은 두지 않는다(사용자 결정).
--       대신 재고 보호는 발행(MD) 측 상한으로 건다(§ create_coupon_issue).
--
-- 혜택 어휘 (게스트 간판과 일관성 유지):
--   weekly_hotdeal_slots는 이미 오픈 칩(시스템 프리셋 2개 + MD 고정칩 12개 + 자유입력,
--   md_benefit_presets 테이블, Migration 327) 구조다. 쿠폰만 닫힌 enum으로 가면 같은
--   MD가 두 화면에서 다른 방식으로 혜택을 입력하게 된다. 그래서:
--     - benefit_type: 6종 CHECK, 정확히 1개 필수 (필터·통계·아이콘용)
--     - benefit_tags: 추가 태그 TEXT[] (최대 5개, 자유입력 + md_benefit_presets 공유)
--
-- 확장 대비 (나플패스):
--   coupon_issues.kind / price_credits 컬럼을 지금 자리만 잡아두되
--   결제·정산·환불 로직은 이번 마이그레이션에 넣지 않는다.
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) coupon_issues — 발행물 (MD가 만든 쿠폰 원본 1행)
-- ============================================================================
CREATE TABLE IF NOT EXISTS coupon_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  benefit_type TEXT NOT NULL CHECK (benefit_type IN (
    'free_entry', 'free_drink', 'free_pass', 'liquor_set', 'table_discount', 'etc'
  )),
  benefit_tags   TEXT[] NOT NULL DEFAULT '{}',  -- 추가 태그 (최대 5개, 아래 CHECK)
  title          TEXT NOT NULL,
  benefit_detail TEXT,                          -- benefit_type='etc'면 필수 (RPC 가드)
  conditions     TEXT,                          -- 사용 조건 (예: "23시 이전 입장")
  thumbnail_url  TEXT,                           -- 없으면 클럽 썸네일 fallback

  -- 재고
  total_count    INTEGER,                       -- NULL = 수량 무제한
  claimed_count  INTEGER NOT NULL DEFAULT 0,
  redeemed_count INTEGER NOT NULL DEFAULT 0,

  -- 기간: 사용마감 하나만. 다운로드는 재고 소진까지 계속 열린다.
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeem_ends_at TIMESTAMPTZ NOT NULL,           -- 현장 사용 마감 (유일한 필수 시각)

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold_out', 'cancelled', 'expired')),

  -- 나플패스 확장 자리 (이번엔 kind='free'만 사용, 결제 로직 없음)
  kind TEXT NOT NULL DEFAULT 'free' CHECK (kind IN ('free', 'pass')),
  price_credits INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (total_count IS NULL OR (total_count > 0 AND total_count <= 300)),
  CHECK (claimed_count >= 0 AND redeemed_count >= 0),
  CHECK (total_count IS NULL OR claimed_count <= total_count),
  CHECK (redeemed_count <= claimed_count),
  CHECK (redeem_ends_at > starts_at),
  CHECK (array_length(benefit_tags, 1) IS NULL OR array_length(benefit_tags, 1) <= 5),
  CHECK (kind <> 'free' OR price_credits IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_coupon_issues_public
  ON coupon_issues(redeem_ends_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_coupon_issues_club
  ON coupon_issues(club_id, redeem_ends_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_coupon_issues_md
  ON coupon_issues(md_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_issues_expiry
  ON coupon_issues(redeem_ends_at) WHERE status IN ('active', 'sold_out');

COMMENT ON TABLE coupon_issues IS
  '파트너 쿠폰 발행물 (MD 1행 = 쿠폰 종류 1개). 보유는 coupon_claims, 사용은 coupon_claims.redeemed_at.';

-- updated_at 자동 갱신 (기존 update_updated_at() 재사용 — 242/238 패턴)
DROP TRIGGER IF EXISTS coupon_issues_updated_at ON coupon_issues;
CREATE TRIGGER coupon_issues_updated_at
  BEFORE UPDATE ON coupon_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2) coupon_claims — 보유 + 사용 (유저 1인 1행)
--    사용(redeem)을 별 테이블로 쪼개지 않는 이유:
--    1 claim = 최대 1 redeem 이 불변식이므로 별 테이블은 조인 비용만 늘고
--    중복사용 방지가 오히려 어려워진다(UNIQUE로 못 막고 COUNT 필요).
--    claims 위의 `redeemed_at IS NULL` 조건부 UPDATE 하나로 원자성이 끝난다.
--    나플패스로 갈 때도 payment_id 컬럼만 붙이면 됨.
-- ============================================================================
CREATE TABLE IF NOT EXISTS coupon_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES coupon_issues(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 발행 시점 스냅샷 (issue가 수정돼도 유저가 받은 조건이 바뀌지 않도록)
  club_id        UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  benefit_type   TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,

  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,   -- issue.redeem_ends_at 복사 (조회 단순화)

  -- 사용 처리
  redeemed_at   TIMESTAMPTZ,            -- NULL = 미사용
  redeem_nonce  TEXT,                   -- 6자리 대문자+숫자 (분쟁 시 대조용, 평상시 MD는 안 봄)
  redeem_color  SMALLINT,               -- 0~5, 사용 화면 그라디언트 인덱스

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'redeemed', 'expired', 'revoked')),

  reminded_at     TIMESTAMPTZ,          -- 마감 리마인더 중복 발송 방지 (Phase 2)
  admin_voided_at TIMESTAMPTZ,          -- admin 정정 표식 (redeemed_at은 보존)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ★ 1발행물당 1유저 1장 — 선착순 경합과 재다운로드를 동시에 차단
  UNIQUE (issue_id, user_id),

  CHECK ((redeemed_at IS NULL) = (status <> 'redeemed')),
  CHECK ((redeemed_at IS NULL) OR (redeem_nonce IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_coupon_claims_user_active
  ON coupon_claims(user_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_coupon_claims_issue
  ON coupon_claims(issue_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_claims_expiry
  ON coupon_claims(expires_at) WHERE status = 'active';

COMMENT ON TABLE coupon_claims IS
  '유저 보유 쿠폰 + 사용 기록. UNIQUE(issue_id,user_id)가 1인1장 + 선착순 경합을 동시에 보장.';

-- ============================================================================
-- 3) coupon_templates — MD 자주 쓰는 쿠폰 저장 (242/513 패턴, 상한 9)
-- ============================================================================
CREATE TABLE IF NOT EXISTS coupon_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name  TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  benefit_type   TEXT NOT NULL CHECK (benefit_type IN (
    'free_entry', 'free_drink', 'free_pass', 'liquor_set', 'table_discount', 'etc'
  )),
  benefit_tags   TEXT[] NOT NULL DEFAULT '{}',
  title          TEXT,
  benefit_detail TEXT,
  conditions     TEXT,
  total_count    INTEGER,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_templates_md ON coupon_templates(md_id, sort_order);

COMMENT ON TABLE coupon_templates IS
  'MD가 자주 쓰는 쿠폰 설정 저장 (최대 9개, check_coupon_template_limit 트리거).';

DROP TRIGGER IF EXISTS coupon_templates_updated_at ON coupon_templates;
CREATE TRIGGER coupon_templates_updated_at
  BEFORE UPDATE ON coupon_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 상한 9 트리거 (513_template_limit_9.sql 패턴)
CREATE OR REPLACE FUNCTION check_coupon_template_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM coupon_templates WHERE md_id = NEW.md_id) >= 9 THEN
    RAISE EXCEPTION '템플릿은 최대 9개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_coupon_template_limit ON coupon_templates;
CREATE TRIGGER enforce_coupon_template_limit
  BEFORE INSERT ON coupon_templates
  FOR EACH ROW EXECUTE FUNCTION check_coupon_template_limit();

-- ============================================================================
-- 4) RLS 정책
--    ⚠️ 정책 내부에서 users를 서브쿼리로 읽으면 무한 재귀 (533/537 락다운 이후).
--    public.is_admin()만 사용. club_partners(공개 SELECT 있음)와 auth.uid()만 사용.
-- ============================================================================
ALTER TABLE coupon_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_templates ENABLE ROW LEVEL SECURITY;

-- coupon_issues: 공개 목록은 active/sold_out만, MD 본인은 전부, admin은 전부
CREATE POLICY "Anyone can read active coupon issues" ON coupon_issues
  FOR SELECT USING (status IN ('active', 'sold_out'));

CREATE POLICY "MD can read own coupon issues" ON coupon_issues
  FOR SELECT USING (auth.uid() = md_id);

CREATE POLICY "Admin can read all coupon issues" ON coupon_issues
  FOR SELECT USING (public.is_admin());

-- issues의 INSERT/UPDATE/DELETE 정책은 만들지 않는다 = RPC(SECURITY DEFINER)로만 쓰기 가능.
-- 클라이언트가 상한·원자성 가드를 우회할 수 없다.

-- coupon_claims: 유저는 본인 것만, MD는 본인 발행분의 claim만, admin은 전부
CREATE POLICY "Users can read own claims" ON coupon_claims
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "MD can read claims of own issues" ON coupon_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coupon_issues i
       WHERE i.id = coupon_claims.issue_id AND i.md_id = auth.uid()
    )
  );

CREATE POLICY "Admin can read all claims" ON coupon_claims
  FOR SELECT USING (public.is_admin());

-- coupon_templates: 본인 것만 전권 (327 md_benefit_presets 패턴)
CREATE POLICY "MD can manage own coupon templates" ON coupon_templates
  FOR ALL USING (auth.uid() = md_id) WITH CHECK (auth.uid() = md_id);

-- ============================================================================
-- 5) RPC: create_coupon_issue (발행)
--    가드: MD/admin → club_partners EXISTS (admin·테스트클럽 우회, 238 로직) →
--    제목 필수 → etc면 detail 필수 → 태그 5개 이하 → 마감이 now()~now()+14일 →
--    남발 방지 상한 (1건당 재고 300, MD 동시 활성 5, MD 일일 신규 5, 클럽당 동시 활성 10)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_coupon_issue(
  p_club_id UUID,
  p_benefit_type TEXT,
  p_title TEXT,
  p_redeem_ends_at TIMESTAMPTZ,
  p_total_count INTEGER DEFAULT NULL,
  p_benefit_tags TEXT[] DEFAULT '{}',
  p_benefit_detail TEXT DEFAULT NULL,
  p_conditions TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL
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

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '제목을 입력해주세요');
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

  INSERT INTO coupon_issues (
    club_id, md_id, benefit_type, benefit_tags, title, benefit_detail,
    conditions, thumbnail_url, total_count, redeem_ends_at
  )
  VALUES (
    p_club_id, v_md_id, p_benefit_type, COALESCE(p_benefit_tags, '{}'), trim(p_title),
    NULLIF(TRIM(p_benefit_detail), ''),
    NULLIF(TRIM(p_conditions), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_total_count, p_redeem_ends_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION create_coupon_issue(UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT[], TEXT, TEXT, TEXT) IS
  '쿠폰 발행 (MD/admin, partner 가드, 남발 방지 상한, 마감 최대 14일)';

-- ============================================================================
-- 6) RPC: update_coupon_issue (수정)
--    benefit_type 수정 불가, redeem_ends_at 단축 불가(연장만),
--    total_count 하향은 claimed_count 이상만.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_coupon_issue(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_benefit_tags TEXT[] DEFAULT NULL,
  p_benefit_detail TEXT DEFAULT NULL,
  p_conditions TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_total_count INTEGER DEFAULT NULL,
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
     SET title          = COALESCE(NULLIF(TRIM(p_title), ''), title),
         benefit_tags   = COALESCE(p_benefit_tags, benefit_tags),
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

COMMENT ON FUNCTION update_coupon_issue(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ) IS
  '쿠폰 수정 (본인/admin, benefit_type 불변, 마감 연장만, 수량 하향은 claimed_count 이상만)';

-- ============================================================================
-- 7) RPC: cancel_coupon_issue (취소)
--    미사용 claim은 일괄 revoked 처리. 이미 사용된 claim은 건드리지 않는다(기록 보존).
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_coupon_issue(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
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
  v_revoked_count INT;
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
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 취소할 수 있어요');
  END IF;
  IF v_issue.status NOT IN ('active', 'sold_out') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 쿠폰이에요');
  END IF;

  UPDATE coupon_issues SET status = 'cancelled' WHERE id = p_id;

  UPDATE coupon_claims
     SET status = 'revoked'
   WHERE issue_id = p_id AND status = 'active';
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- 보유자 알림 (Phase 2에서 notify_user_push 연결 예정 — 지금은 인앱만)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  SELECT user_id, 'coupon_revoked', '쿠폰이 취소됐어요',
         v_issue.title || ' 쿠폰이 발행자에 의해 취소됐어요', '/my-coupons'
    FROM coupon_claims
   WHERE issue_id = p_id AND status = 'revoked';

  RETURN jsonb_build_object('success', true, 'revoked_count', v_revoked_count);
END;
$$;

COMMENT ON FUNCTION cancel_coupon_issue(UUID, TEXT) IS
  '쿠폰 발행 취소 (본인/admin). 미사용 claim은 revoked 처리, 이미 사용된 건은 보존.';

-- ============================================================================
-- 8) RPC: claim_coupon (유저 다운로드) — 원자성 핵심
--    재고 원자성은 FOR UPDATE 대신 조건부 UPDATE 한 방으로 처리한다.
--    Postgres가 UPDATE 대상 행에 배타 잠금을 잡고 대기 후 WHERE 절을 재평가
--    (EvalPlanQual)하므로 초과 발급이 불가능하다.
--    UNIQUE(issue_id, user_id)는 1인 1장을 직교적으로 보장한다.
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_coupon(p_issue_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_issue coupon_issues%ROWTYPE;
  v_new_claimed INT;
  v_claim_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;

  IF v_issue.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', '취소된 쿠폰이에요');
  END IF;
  IF v_issue.status = 'expired' OR v_issue.redeem_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 쿠폰이에요');
  END IF;
  IF v_issue.starts_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', '아직 시작 전이에요', 'starts_at', v_issue.starts_at);
  END IF;
  IF v_issue.status = 'sold_out' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 모두 소진됐어요');
  END IF;

  -- 발행 MD 본인 + 같은 클럽 파트너 전원 차단 (부계정 소진 방어)
  IF v_issue.md_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 발행한 쿠폰은 받을 수 없어요');
  END IF;
  IF EXISTS (
    SELECT 1 FROM club_partners
     WHERE club_id = v_issue.club_id AND md_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽 파트너는 받을 수 없어요');
  END IF;

  -- 재고 원자적 차감
  UPDATE coupon_issues
     SET claimed_count = claimed_count + 1,
         status = CASE
                     WHEN total_count IS NOT NULL
                      AND claimed_count + 1 >= total_count THEN 'sold_out'
                     ELSE status
                   END
   WHERE id = p_issue_id
     AND status = 'active'
     AND (total_count IS NULL OR claimed_count < total_count)
  RETURNING claimed_count INTO v_new_claimed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '방금 모두 소진됐어요');
  END IF;

  BEGIN
    INSERT INTO coupon_claims (
      issue_id, user_id, club_id, benefit_type, title_snapshot, expires_at
    ) VALUES (
      p_issue_id, v_user_id, v_issue.club_id,
      v_issue.benefit_type, v_issue.title, v_issue.redeem_ends_at
    )
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    -- 4)에서 이미 차감했으므로 같은 트랜잭션 안에서 되돌린다.
    UPDATE coupon_issues
       SET claimed_count = claimed_count - 1,
           status = CASE WHEN status = 'sold_out' THEN 'active' ELSE status END
     WHERE id = p_issue_id;
    RETURN jsonb_build_object('success', false, 'error', '이미 받은 쿠폰이에요');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'expires_at', v_issue.redeem_ends_at,
    'remaining', CASE WHEN v_issue.total_count IS NULL
                      THEN NULL ELSE v_issue.total_count - v_new_claimed END
  );
END;
$$;

COMMENT ON FUNCTION claim_coupon(UUID) IS
  '쿠폰 다운로드. 재고는 조건부 UPDATE로, 1인1장은 UNIQUE로 원자적 보장.';

-- ============================================================================
-- 9) RPC: redeem_coupon (사용 처리) — 중복사용 방지 핵심
--    WHERE redeemed_at IS NULL 조건부 UPDATE 하나로 중복사용을 막는다.
-- ============================================================================
CREATE OR REPLACE FUNCTION redeem_coupon(p_claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_nonce TEXT;
  v_color SMALLINT;
  v_row coupon_claims%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
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
     AND user_id = v_user_id          -- 남의 쿠폰 사용 차단
     AND status = 'active'
     AND redeemed_at IS NULL          -- ★ 두 번째 요청은 NOT FOUND
     AND expires_at > now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM coupon_claims
     WHERE id = p_claim_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
    ELSIF v_row.status = 'redeemed' THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 사용한 쿠폰이에요', 'redeemed_at', v_row.redeemed_at);
    ELSIF v_row.status = 'revoked' THEN
      RETURN jsonb_build_object('success', false, 'error', '발행이 취소된 쿠폰이에요');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', '만료된 쿠폰이에요');
    END IF;
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

COMMENT ON FUNCTION redeem_coupon(UUID) IS
  '쿠폰 사용 처리. redeemed_at IS NULL 조건부 UPDATE로 중복사용 방지.';

-- ============================================================================
-- 10) RPC: get_coupon_redeem_view (읽기 전용, server_now 반환)
--     사용 화면 진입 시 호출해 클라이언트 시계 오프셋을 보정한다.
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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT * INTO v_row FROM coupon_claims WHERE id = p_claim_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claim', to_jsonb(v_row),
    'server_now', now()
  );
END;
$$;

COMMENT ON FUNCTION get_coupon_redeem_view(UUID) IS
  '쿠폰 사용 화면 진입용 읽기 전용 조회. server_now로 클라 시계 오프셋 보정.';

-- ============================================================================
-- 11) RPC: expire_old_coupons (cron 전용, 238 expire_old_hotdeals 패턴)
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_old_coupons()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_issues INT;
  v_claims INT;
BEGIN
  UPDATE coupon_claims SET status = 'expired'
   WHERE status = 'active' AND expires_at <= now();
  GET DIAGNOSTICS v_claims = ROW_COUNT;

  UPDATE coupon_issues SET status = 'expired'
   WHERE status IN ('active', 'sold_out') AND redeem_ends_at <= now();
  GET DIAGNOSTICS v_issues = ROW_COUNT;

  RETURN jsonb_build_object('issues', v_issues, 'claims', v_claims);
END;
$$;

COMMENT ON FUNCTION expire_old_coupons() IS
  '사용 마감 지난 쿠폰/보유분을 expired로 전환 (cron에서 호출)';

-- cron 등록 (312 하단 패턴, 10분 간격)
SELECT cron.schedule('expire-coupons', '*/10 * * * *', $$SELECT expire_old_coupons();$$);

-- ============================================================================
-- 12) RPC: get_md_coupon_stats (MD/admin, 다운로드·사용·사용률)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_md_coupon_stats(p_issue_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_issue coupon_issues%ROWTYPE;
  v_claimed INT;
  v_redeemed INT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;
  IF v_issue.md_id <> v_md_id AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 조회할 수 있어요');
  END IF;

  SELECT COUNT(*) FILTER (WHERE c.status <> 'revoked'),
         COUNT(*) FILTER (WHERE c.status = 'redeemed')
    INTO v_claimed, v_redeemed
    FROM coupon_claims c
    JOIN users u ON u.id = c.user_id
   WHERE c.issue_id = p_issue_id AND COALESCE(u.is_test, false) = false;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', v_claimed,
    'redeemed', v_redeemed,
    'rate', CASE WHEN v_claimed > 0 THEN round(v_redeemed::NUMERIC / v_claimed * 100, 1) ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION get_md_coupon_stats(UUID) IS
  'MD 쿠폰 통계 (본인/admin). 테스트 유저 제외.';

-- ============================================================================
-- 13) RPC: admin_revoke_coupon_claim (admin 전용, 오사용 정정)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_revoke_coupon_claim(
  p_claim_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 사용할 수 있어요');
  END IF;

  UPDATE coupon_claims
     SET admin_voided_at = now()
   WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION admin_revoke_coupon_claim(UUID, TEXT) IS
  'admin 전용 오사용 정정 표식. redeemed_at은 보존(기록 유지), admin_voided_at만 기록.';
