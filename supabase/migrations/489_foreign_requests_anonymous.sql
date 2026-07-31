-- ============================================================================
-- Migration 489: 외국인 컨시어지 요청 — 비로그인(익명) 신청 허용
--
-- 배경: 외국인 이탈퍼널 분석 결과, foreign_login_view 93명 중 로그인 버튼 클릭
--      19명(20%)뿐 — 74명(80%)이 로그인 화면 보고 버튼도 안 누르고 이탈.
--      컨시어지 폼은 이메일/WhatsApp만 받으면 되는데 소셜 로그인을 강제한 게 원인.
--      → user_id NOT NULL + RLS(auth.uid()=user_id) 때문에 로그인이 구조적으로 필수였음.
--
-- 변경: user_id nullable + anon 익명 INSERT 허용(user_id IS NULL) + 연락처 24h rate limit.
--      로그인 유저 흐름(user inserts own foreign request)은 그대로 유지.
--
-- ⚠️ 마이그레이션 먼저 적용 후 코드 배포 (익명 insert 코드가 이 스키마에 의존).
-- ============================================================================

-- 1. user_id를 nullable로 (익명 신청은 user_id 없이 INSERT)
ALTER TABLE foreign_requests ALTER COLUMN user_id DROP NOT NULL;

-- 2. 익명(비로그인) 신청 허용 — user_id IS NULL인 행만.
--    로그인 유저는 기존 "user inserts own foreign request"(auth.uid()=user_id) 정책 사용.
GRANT INSERT ON foreign_requests TO anon;

CREATE POLICY "anon inserts foreign request" ON foreign_requests
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- 3. 스팸 방지 — 같은 연락처(contact_value)로 24시간 내 중복 신청 차단.
--    익명 신청을 열면 무한 생성 가능 → admin 수동 처리 컨시어지라 스팸이 치명적.
--    SECURITY DEFINER로 RLS 우회 조회(anon은 남의 행 SELECT 불가하므로 필수).
CREATE OR REPLACE FUNCTION check_foreign_request_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM foreign_requests
    WHERE contact_value = NEW.contact_value
      AND created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'duplicate_foreign_request_within_24h'
      USING HINT = '같은 연락처로 24시간 내 1건만 신청 가능';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foreign_request_rate_limit ON foreign_requests;
CREATE TRIGGER foreign_request_rate_limit
  BEFORE INSERT ON foreign_requests
  FOR EACH ROW EXECUTE FUNCTION check_foreign_request_rate_limit();
