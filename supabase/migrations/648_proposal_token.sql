-- ============================================================================
-- Migration 648: 제안서 접근 토큰
--
-- 배경: 제안서 페이지가 /booking/proposal/{foreign_requests.id} 라서 예약의
--      원본 id가 URL에 그대로 노출된다. 이 링크는 운영자가 카톡으로 MD에게
--      직접 보내는데, 받은 사람이 id만 바꾸면 다른 손님 예약도 열어서
--      승인/거절을 누를 수 있다(로그인이 없는 페이지라 아무 방어가 없다).
--
--      같은 성격의 다른 페이지는 이미 토큰을 쓴다.
--        booking_confirmations.public_token  (손님 패스)   — Migration 633
--        booking_confirmations.md_token      (MD 패스)     — Migration 635
--      제안서만 빠져 있었다. 동일한 방식(16바이트 hex)으로 맞춘다.
--
-- 로그인을 요구하지 않는 건 그대로 둔다 — MD가 카톡으로 받은 링크만으로 바로
-- 답할 수 있어야 회신율이 산다는 기존 설계 의도는 유효하다. 바뀌는 건
-- "예약 id를 아는 사람"에서 "이 링크를 받은 사람"으로 범위가 좁아지는 것뿐이다.
-- ============================================================================

ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS proposal_token TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(16), 'hex');

-- 이미 있던 행에도 각각 다른 토큰을 채운다.
-- (DEFAULT는 새 행에만 적용되므로 기존 행은 NULL로 남는다)
UPDATE foreign_requests
   SET proposal_token = encode(gen_random_bytes(16), 'hex')
 WHERE proposal_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_foreign_requests_proposal_token
  ON foreign_requests (proposal_token);

COMMENT ON COLUMN foreign_requests.proposal_token IS
  'MD 제안서 페이지(/booking/proposal/{token}) 접근용 무작위 토큰. 예약 id 노출 방지.';
