-- ============================================
-- users 테이블에 lang(선호 언어) 컬럼 추가
-- 이메일을 모국어로 발송하기 위함. 웹/앱은 URL ?lang= 로 알지만
-- 서버(Edge Function) 발송 시점엔 유저 선호 언어를 알 방법이 없어 DB에 저장.
--   ko = 한국어(기본), en/ja/zh = 외국어
-- 가입 시 ?lang= 값을 저장. country_code(국적) ≠ lang(언어).
-- ============================================

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'ko'
    CHECK (lang IN ('ko', 'en', 'ja', 'zh'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN users.lang IS '선호 언어(ko/en/ja/zh). 이메일 발송 언어 결정용. 가입 시 ?lang= 값 저장.';
