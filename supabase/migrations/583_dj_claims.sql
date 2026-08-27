-- ============================================================================
-- Migration 583: DJ 프로필 소유권 인증 (dj_claims) + 찜 공개 카운트
-- 날짜: 2026-08-27
-- 선행: 557(djs, dj_aliases), 570(user_favorite_djs), 559(is_admin())
--
-- 배경:
--   라인업 수집으로 djs에 443명이 쌓였지만, DJ 본인이 "이게 나"라고 말할 방법이
--   없다. 사진 0명·소개 0명 — 운영자가 포스터에서 긁어 만든 빈 껍데기 데이터다.
--
-- 검증 방식은 MD 신청과 완전히 동일하다(사용자 결정) — 인증코드·DM 왕복 없음.
-- 조사 결과 MD 승인에도 실제 소유권 증명은 없다(md/apply/route.ts는 인스타
-- 형식 검증만, 운영자는 MDManagement.tsx에서 링크를 열어보는 게 전부).
-- DJ는 라인업 기록이 이미 있어 "이 계정이 이 DJ가 맞나" 대조 근거가 MD보다 강하다.
--
-- ⚠️ 편집은 이 마이그레이션에서 열지 않는다(RLS UPDATE 금지 — 584에서 RPC로만
--    연다). djs.slug/deleted_at/resident_club_id까지 열리는 것을 막기 위함.
-- ============================================================================

-- ============================================================================
-- 1) djs 확장 — 소유자 컬럼
-- ============================================================================
ALTER TABLE djs ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE djs ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 한 계정이 여러 DJ를 먹는 것을 DB가 물리적으로 거부.
-- SET NULL 필수(CASCADE 아님) — 탈퇴 1명이 DJ 마스터 + lineup_sets FK를 무너뜨리면 안 된다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_djs_claimed_by ON djs(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;

COMMENT ON COLUMN djs.claimed_by_user_id IS 'DJ 본인 인증 소유자. NULL = 미인증(운영자 등록 데이터만).';

-- ============================================================================
-- 2) dj_claims — 인증 신청
-- ============================================================================
CREATE TABLE IF NOT EXISTS dj_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  claimant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- NULL = 신규 등록 요청 (검색해도 자기 이름이 없는 DJ — 미수집 클럽에서 뛰는 경우)
  dj_id UUID REFERENCES djs(id) ON DELETE CASCADE,
  requested_name TEXT,      -- dj_id가 NULL일 때만: 신청자가 적은 활동명
  requested_clubs TEXT,     -- dj_id가 NULL일 때만: 주로 뛰는 클럽 (운영자 판단 근거)

  claimed_instagram TEXT NOT NULL,  -- @ 없이 소문자. MD와 같은 정규식 검증만
  memo TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  CONSTRAINT dj_claims_target CHECK (dj_id IS NOT NULL OR requested_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_dj_claims_pending ON dj_claims(created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dj_claims_claimant ON dj_claims(claimant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dj_claims_dj ON dj_claims(dj_id) WHERE dj_id IS NOT NULL;

COMMENT ON TABLE dj_claims IS 'DJ 본인 인증 신청. 유일한 쓰기 경로는 request_dj_claim() RPC — INSERT 정책 없음.';

-- ============================================================================
-- 3) request_dj_claim() — 유일한 쓰기 경로
--
-- 트리거로 쪼개지 않고 한 함수에서 전부 검증한다(Migration 440 교훈 — 승인/신청
-- 흐름을 트리거로 나누면 실패 시 롤백되어 기능이 영구 500이 될 수 있다).
-- ============================================================================
CREATE OR REPLACE FUNCTION request_dj_claim(
  p_dj_id UUID,
  p_instagram TEXT,
  p_requested_name TEXT DEFAULT NULL,
  p_requested_clubs TEXT DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean_ig TEXT;
  v_existing_pending UUID;
  v_new_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_dj_id IS NULL AND (p_requested_name IS NULL OR trim(p_requested_name) = '') THEN
    RAISE EXCEPTION '활동명을 입력해주세요';
  END IF;

  -- 인스타 형식 검증 — md/apply/route.ts와 동일 정규식
  v_clean_ig := lower(trim(leading '@' from trim(p_instagram)));
  IF v_clean_ig !~ '^[a-z0-9._]{1,30}$' THEN
    RAISE EXCEPTION '인스타그램 아이디 형식이 올바르지 않습니다';
  END IF;

  -- 대상 DJ가 이미 인증됐는지
  IF p_dj_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM djs WHERE id = p_dj_id AND claimed_by_user_id IS NOT NULL) THEN
      RAISE EXCEPTION '이미 인증된 프로필이에요';
    END IF;
  END IF;

  -- 신청자가 이미 다른 DJ를 소유 중인지
  IF EXISTS (SELECT 1 FROM djs WHERE claimed_by_user_id = v_uid) THEN
    RAISE EXCEPTION '한 계정당 하나만 인증할 수 있어요';
  END IF;

  -- rate limit: 24h 5건 (576의 check_lineup_report_limits 패턴)
  IF (SELECT count(*) FROM dj_claims WHERE claimant_id = v_uid AND created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION '하루에 최대 5건까지 신청할 수 있어요';
  END IF;

  -- 같은 (claimant_id, dj_id) pending이 이미 있으면 새로 만들지 않고 갱신
  -- (dj_id가 NULL인 신규 요청은 매번 새 행 — 활동명이 다를 수 있어 병합 기준이 없다)
  IF p_dj_id IS NOT NULL THEN
    SELECT id INTO v_existing_pending
    FROM dj_claims
    WHERE claimant_id = v_uid AND dj_id = p_dj_id AND status = 'pending'
    LIMIT 1;
  END IF;

  IF v_existing_pending IS NOT NULL THEN
    UPDATE dj_claims
    SET claimed_instagram = v_clean_ig, memo = p_memo, created_at = now()
    WHERE id = v_existing_pending;
    v_new_id := v_existing_pending;
  ELSE
    INSERT INTO dj_claims (claimant_id, dj_id, requested_name, requested_clubs, claimed_instagram, memo)
    VALUES (v_uid, p_dj_id, NULLIF(trim(p_requested_name), ''), NULLIF(trim(p_requested_clubs), ''), v_clean_ig, NULLIF(trim(p_memo), ''))
    RETURNING id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION request_dj_claim(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION request_dj_claim IS 'DJ 인증 신청 유일 경로. dj_claims에 INSERT 정책이 없으므로 이 RPC를 우회할 수 없다.';

-- ============================================================================
-- 4) RLS — 576 패턴
-- ============================================================================
ALTER TABLE dj_claims ENABLE ROW LEVEL SECURITY;

-- INSERT 정책 없음 — 유일한 쓰기 경로가 RPC(SECURITY DEFINER)

DROP POLICY IF EXISTS dj_claims_select ON dj_claims;
CREATE POLICY dj_claims_select ON dj_claims
  FOR SELECT USING (claimant_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS dj_claims_update ON dj_claims;
CREATE POLICY dj_claims_update ON dj_claims
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- 5) 운영자 푸시 알림 — AFTER INSERT만 (UPDATE도 걸면 재신청마다 폭탄)
--
-- ⚠️ 실측(2026-08-27): admin 6명 중 푸시 토큰 보유는 2명뿐. 나머지는 앱 미설치라
-- 푸시가 안 간다 — /admin/mds 탭 라벨의 pending 건수가 실질적인 알림 역할이다.
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_admins_dj_claim()
RETURNS TRIGGER AS $$
DECLARE
  v_admin UUID;
  v_name TEXT;
  v_dj_name TEXT;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(display_name, name, '익명') INTO v_name FROM users WHERE id = NEW.claimant_id;

  IF NEW.dj_id IS NOT NULL THEN
    SELECT display_name INTO v_dj_name FROM djs WHERE id = NEW.dj_id;
  ELSE
    v_dj_name := NEW.requested_name;
  END IF;

  SELECT count(*) INTO v_count FROM dj_claims WHERE status = 'pending';

  FOR v_admin IN
    SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    BEGIN
      PERFORM notify_user_push(
        v_admin,
        'DJ 인증 신청 도착',
        v_name || ' → ' || COALESCE(v_dj_name, '(이름 없음)')
          || CASE WHEN v_count > 1 THEN ' (대기 ' || v_count || '건)' ELSE '' END,
        jsonb_build_object('type', 'dj_claim', 'claim_id', NEW.id::text),
        '/admin/mds?tab=dj'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_admins_dj_claim 실패: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_admins_dj_claim ON dj_claims;
CREATE TRIGGER trg_notify_admins_dj_claim
  AFTER INSERT ON dj_claims
  FOR EACH ROW EXECUTE FUNCTION notify_admins_dj_claim();

-- ============================================================================
-- 6) 찜 카운트 공개 SELECT — 243(클럽 찜 공개) 패턴 그대로
--
-- 지금 user_favorite_djs는 본인 row만 조회 가능(570)이라 익명이 카운트를 셀 수
-- 없다. dj_id·created_at만 의미 있고 "누가 찜했는지"는 민감 정보가 아니다.
-- 기존 FOR ALL 본인 정책은 그대로 둔다 — 쓰기는 여전히 본인만.
-- ============================================================================
DROP POLICY IF EXISTS "Public can read favorite dj rows" ON user_favorite_djs;
CREATE POLICY "Public can read favorite dj rows" ON user_favorite_djs
  FOR SELECT USING (TRUE);

COMMENT ON TABLE user_favorite_djs IS
  '유저가 찜한 DJ. 정렬 우선순위(570) + 공개 카운트(583, /dj/[slug] 팔로움 숫자) 양쪽에 쓰인다. 쓰기는 본인만.';
