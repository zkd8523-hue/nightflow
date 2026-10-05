-- 689: 뉴스레터 구독자 — 발행 전 수요 검증용
--
-- 왜 지금 테이블부터: 발행을 시작하기 전에 **구독 의사가 있는지**를 먼저 확인한다.
-- 매주 원고를 쓰기 시작했는데 아무도 안 받는다면 그 시간이 통째로 버려진다.
-- 폼만 띄워두고 수집만 하다가, 숫자가 나오면 그때 1호를 보낸다.
--
-- 판정 기준(2026-10-05 설정): 4주 안에 200명. 라인업 페이지가 주 1,000세션쯤
-- 받고 있으니 전환 2%면 주 20명, 4주면 80명이다. 200명을 넘으면 수요가 있는 것이고
-- 50명 미만이면 "검색으로 들어와 보고 나가는" 트래픽이지 구독할 사람은 아니라는 뜻이다.
--
-- 개인정보: 이메일만 받는다. 이름·전화·생년월일을 받지 않는다. 수집 목적이
-- 뉴스레터 발송 하나뿐이라 그 이상은 받을 근거가 없다.
-- 광고성 정보 수신 동의는 별도 컬럼으로 분리해 기록한다(정보통신망법).

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,

  -- 어디서 들어왔나. 어느 자리가 구독을 만드는지 봐야 다음 자리를 정한다.
  source        TEXT,                       -- home_hero / lineup_page / club_detail / ...
  anon_id       UUID,                       -- user_events 와 이어 붙여 퍼널을 본다
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- 동의는 두 개로 나눠 받고 따로 기록한다. 근거 법이 다르기 때문이다 —
  -- 개인정보 수집·이용은 개인정보보호법(필수), 광고성 정보 수신은
  -- 정보통신망법 제50조(선택)다. 하나로 묶으면 포괄동의가 되어 둘 다 무효가 될 수 있다.
  -- 체크 시각까지 남긴다 — 나중에 증빙이 필요할 수 있다.
  agreed_privacy     BOOLEAN NOT NULL DEFAULT false,   -- [필수] 개인정보 수집·이용
  agreed_marketing   BOOLEAN NOT NULL DEFAULT false,   -- [필수] 광고성 정보 수신(=뉴스레터 발송 그 자체)
  agreed_at          TIMESTAMPTZ,

  -- 상태
  confirmed_at   TIMESTAMPTZ,               -- 더블 옵트인을 붙일 경우
  unsubscribed_at TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동의가 빠진 줄은 애초에 들어오지 못하게 막는다. UI 체크만 믿지 않는다.
-- 둘 다 필수다 — 수신 동의 없이는 보낼 수가 없으므로 구독이 성립하지 않는다.
ALTER TABLE newsletter_subscribers
  DROP CONSTRAINT IF EXISTS newsletter_requires_privacy_consent;
ALTER TABLE newsletter_subscribers
  ADD CONSTRAINT newsletter_requires_privacy_consent
  CHECK (agreed_privacy AND agreed_marketing);

-- 같은 주소가 여러 번 들어와도 한 줄만 남는다. 대소문자는 구분하지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email_unique
  ON newsletter_subscribers (lower(email));
CREATE INDEX IF NOT EXISTS idx_newsletter_active
  ON newsletter_subscribers (created_at DESC) WHERE unsubscribed_at IS NULL;

COMMENT ON TABLE  newsletter_subscribers IS '뉴스레터 구독자. 발행 전 수요 검증 단계에서는 수집만 하고 발송하지 않는다';
COMMENT ON COLUMN newsletter_subscribers.source IS '구독 폼이 놓인 자리. 어느 자리가 전환을 만드는지 판단용';
COMMENT ON COLUMN newsletter_subscribers.anon_id IS 'user_events.anon_id 와 같은 값. 세션→구독 전환율 계산에 쓴다';
COMMENT ON COLUMN newsletter_subscribers.agreed_privacy IS '[필수] 개인정보 수집·이용 동의(개인정보보호법). 없으면 CHECK 로 거부된다';
COMMENT ON COLUMN newsletter_subscribers.agreed_marketing IS '[필수] 광고성 정보 수신 동의(정보통신망법 제50조). 발송 자체가 서비스라 없으면 구독 불가';

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- 아무나 구독할 수 있어야 하므로 INSERT 는 공개한다.
-- 단 SELECT 는 막는다 — 이메일 목록이 공개로 읽히면 안 된다.
DROP POLICY IF EXISTS "anyone can subscribe" ON newsletter_subscribers;
CREATE POLICY "anyone can subscribe" ON newsletter_subscribers
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 읽기·수정은 service_role 만 (정책을 안 만들면 기본 거부).

DROP TRIGGER IF EXISTS newsletter_subscribers_updated_at ON newsletter_subscribers;
CREATE TRIGGER newsletter_subscribers_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 확인:
--   SELECT count(*) FILTER (WHERE unsubscribed_at IS NULL) AS 구독중,
--          count(*) AS 전체, min(created_at) AS 첫구독
--   FROM newsletter_subscribers;
--
--   -- 어느 자리가 전환을 만드나
--   SELECT source, count(*) FROM newsletter_subscribers GROUP BY 1 ORDER BY 2 DESC;
--
--   -- 수신거부 비율 (발송 시작 후)
--   SELECT round(100.0 * count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)
--                / nullif(count(*),0), 1) AS 수신거부율
--   FROM newsletter_subscribers;
