-- 695: 아티클 호 발송 기록 — 같은 호를 두 번 받지 않게 한다
--
-- 689/690 은 "누가 구독했나"까지만 안다. 호를 실제로 보내기 시작하면
-- **누구에게 몇 호를 보냈는가**를 따로 적어야 한다. 그게 없으면
-- 발송 버튼을 두 번 누르거나, 타임아웃으로 중간에 끊겨 다시 돌릴 때
-- 같은 사람이 같은 호를 두 번 받는다. 뉴스레터에서 이건 바로 수신거부로 간다.
--
-- welcome_sent_at(690)으로는 못 한다. 그건 "확인 메일 1통"의 시각 한 칸이고
-- 호는 매주 쌓인다. 한 칸에 호 하나만 기록할 수 있는 구조다.
--
-- ⚠️ 적용은 Supabase 대시보드에서 손으로 한다(이 프로젝트 규칙). db push 금지.
--    이 테이블이 없으면 발송 라우트는 아예 동작하지 않는다 — 중복 방지 장치가
--    없는 상태로 메일이 나가느니 발송이 멈추는 쪽이 낫다.

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,

  -- src/lib/weekly/issues.ts 의 slug 와 같은 값('2026-10-22'). 호를 테이블로 안 옮겼으니
  -- 여기도 FK 가 아니라 문자열이다. 오타가 나면 중복 방지가 통째로 무력해지므로
  -- 라우트는 WEEKLY_EMAIL_ISSUES 에 있는 slug 만 받는다.
  issue_slug    TEXT NOT NULL,

  -- claimed = 보내기로 선점했다(아직 Resend 응답 전)
  -- sent     = Resend 가 접수했다
  -- failed   = Resend 가 거절했다. 재시도 대상은 이것뿐이다.
  --
  -- 왜 선점을 먼저 쓰나: 발송 요청을 보내기 **전에** 줄을 잡아야 한다.
  -- 보낸 뒤에 기록하면 그 사이에 버튼이 한 번 더 눌렸을 때 둘 다 통과한다.
  -- 반대로 선점이 먼저면 최악의 경우가 "안 보냈는데 보낸 걸로 남는 것"인데,
  -- 중복 수신보다 이쪽이 낫다(claimed 로 남아 있어 눈에 보인다).
  status        TEXT NOT NULL DEFAULT 'claimed'
                CHECK (status IN ('claimed', 'sent', 'failed')),

  resend_id     TEXT,          -- Resend 가 돌려준 메시지 id. 반송 추적에 쓴다
  error         TEXT,          -- 실패 사유 원문

  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

-- 이 인덱스가 중복 방지의 전부다. 애플리케이션 조건문이 아니라 DB 제약으로 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_sends_once
  ON newsletter_sends (subscriber_id, issue_slug);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_issue
  ON newsletter_sends (issue_slug, status);

COMMENT ON TABLE  newsletter_sends IS '아티클 호별 발송 기록. (subscriber_id, issue_slug) 유니크로 같은 호 중복 발송을 막는다';
COMMENT ON COLUMN newsletter_sends.status IS 'claimed=선점(응답 전) / sent=접수됨 / failed=거절됨(재시도 대상)';
COMMENT ON COLUMN newsletter_sends.resend_id IS 'Resend 메시지 id. 웹훅의 반송·스팸신고를 이 줄과 이어 붙일 때 쓴다';

ALTER TABLE newsletter_sends ENABLE ROW LEVEL SECURITY;
-- 정책을 만들지 않는다 = anon/authenticated 전부 거부. service_role 만 읽고 쓴다.
-- 발송 라우트와 관리자 화면 둘 다 service_role 로 접근한다(689 와 같은 방식).

-- 확인:
--   -- 호별 발송 현황
--   SELECT issue_slug, status, count(*)
--   FROM newsletter_sends GROUP BY 1,2 ORDER BY 1,2;
--
--   -- 아직 안 받은 구독자 수 (발송 대상)
--   SELECT count(*) FROM newsletter_subscribers s
--   WHERE s.unsubscribed_at IS NULL AND s.bounced_at IS NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM newsletter_sends x
--       WHERE x.subscriber_id = s.id AND x.issue_slug = '2026-10-22'
--     );
--
--   -- 응답 전에 끊긴 줄(선점만 되고 멈춘 것). 자동 재시도 대상이 아니다 — 눈으로 보고 판단한다.
--   SELECT * FROM newsletter_sends WHERE status = 'claimed' AND claimed_at < now() - interval '10 minutes';
