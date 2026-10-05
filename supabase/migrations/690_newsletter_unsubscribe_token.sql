-- 690: 뉴스레터 수신거부 토큰
--
-- 689에서 unsubscribed_at 컬럼은 만들었지만 **채울 경로가 없었다.**
-- 정보통신망법 제50조 제4항은 광고성 정보에 수신거부 방법을 명시하고,
-- 그 방법이 "수신자가 쉽게" 쓸 수 있어야 한다고 요구한다.
-- 메일 안의 링크 한 번으로 끝나야 한다는 뜻이다.
--
-- 왜 토큰인가: 수신거부는 로그인 없이 동작해야 한다. 뉴스레터 구독자 대부분은
-- 나플 계정이 없다(이메일만 받는다). 그렇다고 ?email=... 로 받으면
-- 아무나 남의 주소를 적어 넣어 끊어버릴 수 있다. 추측 불가능한 난수를 주소에 싣는다.
--
-- 왜 id(UUID)를 그냥 안 쓰나: id 는 INSERT 를 한 클라이언트가 .select() 로 돌려받을 수
-- 있는 값이고, 나중에 다른 곳(관리 화면 URL 등)에 노출될 여지가 있다.
-- 수신거부 전용 비밀값을 따로 두면 그 하나만 지키면 된다.

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

-- gen_random_bytes(24) → base64 32자. 추측 공간이 2^192라 무차별 대입이 불가능하다.
-- base64 의 '+' '/' '=' 는 URL 에서 깨지므로 URL-safe 문자로 바꾼다.
UPDATE newsletter_subscribers
SET unsubscribe_token = translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_')
WHERE unsubscribe_token IS NULL;

ALTER TABLE newsletter_subscribers
  ALTER COLUMN unsubscribe_token SET DEFAULT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
ALTER TABLE newsletter_subscribers
  ALTER COLUMN unsubscribe_token SET NOT NULL;

-- 수신거부 링크를 열면 이 토큰으로 딱 한 줄을 찾는다. 유니크 + 인덱스.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsub_token
  ON newsletter_subscribers (unsubscribe_token);

COMMENT ON COLUMN newsletter_subscribers.unsubscribe_token IS
  '수신거부 링크용 난수. 로그인 없이 본인 확인을 대신한다. 절대 목록으로 노출 금지';

-- 확인 메일을 실제로 보냈는지. 중복 구독일 때 두 번 보내지 않기 위한 표시이기도 하다.
-- confirmed_at(더블 옵트인용)과는 뜻이 다르다 — 이건 "우리가 보냈다"이고
-- confirmed_at 은 "상대가 눌렀다"다. 섞어 쓰면 나중에 옵트인을 붙일 때 꼬인다.
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN newsletter_subscribers.welcome_sent_at IS
  '신청 확인 메일을 보낸 시각. NULL 이면 아직 못 보냈다(발송 실패 포함). 재발송 판단에 쓴다';

-- 수신거부 처리 RPC.
--
-- 왜 함수로 감싸나: 테이블 UPDATE 를 anon 에게 열어주면 토큰만 맞으면 다른 컬럼도
-- 바꿀 수 있는 정책을 써야 한다. 함수 하나만 열면 바뀌는 건 unsubscribed_at 뿐이다.
-- SECURITY DEFINER 라 RLS 를 통과하지만, 토큰이 틀리면 아무 줄도 건드리지 못한다.
--
-- 반환: 'ok'(방금 끊음) / 'already'(이미 끊겨 있음) / 'notfound'(토큰 틀림).
-- 이미 끊긴 경우를 'ok' 와 나누는 이유는 화면 문구를 다르게 쓰기 위해서다.
-- 수신거부 링크는 메일 클라이언트의 프리페치로 한 번 더 눌리는 일이 흔하다.
CREATE OR REPLACE FUNCTION newsletter_unsubscribe(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(p_token) < 10 THEN
    RETURN 'notfound';
  END IF;

  SELECT (unsubscribed_at IS NOT NULL) INTO v_already
  FROM newsletter_subscribers
  WHERE unsubscribe_token = p_token;

  IF NOT FOUND THEN
    RETURN 'notfound';
  END IF;

  IF v_already THEN
    RETURN 'already';
  END IF;

  UPDATE newsletter_subscribers
  SET unsubscribed_at = now()
  WHERE unsubscribe_token = p_token;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION newsletter_unsubscribe(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newsletter_unsubscribe(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION newsletter_unsubscribe(TEXT) IS
  '메일 안 수신거부 링크 전용. 토큰이 맞는 한 줄의 unsubscribed_at 만 채운다';

-- 확인:
--   -- 토큰이 전부 채워졌나
--   SELECT count(*) FILTER (WHERE unsubscribe_token IS NULL) AS 토큰없음 FROM newsletter_subscribers;
--
--   -- 확인 메일 미발송분
--   SELECT count(*) FROM newsletter_subscribers WHERE welcome_sent_at IS NULL;
--
--   -- 수신거부 동작 시험 (실제 토큰 하나로)
--   SELECT newsletter_unsubscribe('틀린토큰값입니다');   -- notfound
