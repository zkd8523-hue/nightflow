-- ============================================================================
-- Migration 654: 한국인 예약 요청에도 제안서/MD 응답/확정서 붙이기
--
-- 배경: foreign_requests에는 제안서(proposal_token, Mig 648), MD 응답
--      (md_response 등, Mig 644), 담당 MD(assigned_md_id, Mig 632)가 있는데
--      korean_booking_requests(Mig 652)에는 이 세트가 아예 없었다 — 운영자가
--      MD에게 "이 조건 되냐"를 물을 방법이 카톡 텍스트뿐이었다.
--
-- 새 테이블/새 API를 만들지 않는다 — 컬럼만 그대로 미러링하고,
-- /api/proposal-response, /api/admin/booking 두 라우트가 request_type으로
-- 어느 테이블인지 분기해서 같은 로직을 공유한다.
-- ============================================================================

ALTER TABLE korean_booking_requests
  ADD COLUMN IF NOT EXISTS proposal_token TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS assigned_md_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS md_response TEXT
    CHECK (md_response IS NULL OR md_response IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS md_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS md_table_choosable BOOLEAN,
  ADD COLUMN IF NOT EXISTS md_table_options TEXT,
  ADD COLUMN IF NOT EXISTS md_reject_reason TEXT
    CHECK (md_reject_reason IS NULL OR md_reject_reason IN ('budget', 'absent', 'expired')),
  ADD COLUMN IF NOT EXISTS md_required_amount INTEGER
    CHECK (md_required_amount IS NULL OR md_required_amount > 0);

-- 이미 있던 행에도 각각 다른 토큰을 채운다(DEFAULT는 새 행에만 적용됨).
UPDATE korean_booking_requests
   SET proposal_token = encode(gen_random_bytes(16), 'hex')
 WHERE proposal_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_korean_booking_requests_proposal_token
  ON korean_booking_requests (proposal_token);
CREATE INDEX IF NOT EXISTS idx_korean_booking_requests_assigned_md
  ON korean_booking_requests(assigned_md_id) WHERE assigned_md_id IS NOT NULL;

COMMENT ON COLUMN korean_booking_requests.proposal_token IS
  'MD 제안서 페이지(/booking/proposal/{token}) 접근용 무작위 토큰. foreign_requests와 같은 페이지를 공유한다.';
COMMENT ON COLUMN korean_booking_requests.md_response IS
  'MD가 제안서에서 누른 응답. NULL이면 아직 회신 없음.';

-- ============================================================================
-- booking_confirmations을 한국 예약도 가리킬 수 있게 한다.
--
-- request_id는 foreign_requests(id)로 FK 고정돼 있었다 — 한국 예약 확정서를
-- 못 저장했다. request_type 컬럼을 추가해 어느 테이블인지 구분하고, FK는
-- 제거한다(두 테이블 중 하나를 가리키는 FK는 CHECK 제약으로 못 만든다 —
-- 애플리케이션 레벨에서 request_type+request_id 조합으로 무결성을 지킨다).
-- ============================================================================

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'foreign'
    CHECK (request_type IN ('foreign', 'korean'));

ALTER TABLE booking_confirmations
  DROP CONSTRAINT IF EXISTS booking_confirmations_request_id_fkey;

-- request_id의 UNIQUE(1:1 보장)는 유지하되, request_type과 묶어야 두 테이블의
-- id가 우연히 같을 가능성(사실상 없지만 UUID 공간 안전을 위해)에도 안전하다.
ALTER TABLE booking_confirmations
  DROP CONSTRAINT IF EXISTS booking_confirmations_request_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_conf_request_type_id
  ON booking_confirmations(request_type, request_id);

COMMENT ON COLUMN booking_confirmations.request_type IS
  '이 확정서가 foreign_requests인지 korean_booking_requests인지. request_id는 그 테이블의 id.';

-- 담당 MD 조회 정책도 두 테이블 다 확인하도록 교체.
DROP POLICY IF EXISTS "assigned md reads own confirmation" ON booking_confirmations;
CREATE POLICY "assigned md reads own confirmation" ON booking_confirmations
  FOR SELECT USING (
    (request_type = 'foreign' AND EXISTS (
      SELECT 1 FROM foreign_requests fr
      WHERE fr.id = booking_confirmations.request_id AND fr.assigned_md_id = auth.uid()
    ))
    OR
    (request_type = 'korean' AND EXISTS (
      SELECT 1 FROM korean_booking_requests kr
      WHERE kr.id = booking_confirmations.request_id AND kr.assigned_md_id = auth.uid()
    ))
  );

-- ============================================================================
-- booking_reviews, arrival_pings도 같은 이유로 request_type을 붙인다.
-- 손님용/MD용 확인서 페이지(/booking/[token], /booking/md/[token])가 이미
-- 한국 예약도 열 수 있게 됐으니, 그 안의 "도착 신호"·"리뷰 남기기" 버튼도
-- 한국 예약에서 눌렀을 때 정상 동작해야 한다(2026-09-06).
-- ============================================================================

ALTER TABLE booking_reviews
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'foreign'
    CHECK (request_type IN ('foreign', 'korean'));
ALTER TABLE booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_request_id_fkey;
ALTER TABLE booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_request_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_reviews_request_type_id
  ON booking_reviews(request_type, request_id);

ALTER TABLE arrival_pings
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'foreign'
    CHECK (request_type IN ('foreign', 'korean'));
ALTER TABLE arrival_pings
  DROP CONSTRAINT IF EXISTS arrival_pings_request_id_fkey;
-- ⚠️ UNIQUE로 만들면 안 된다. Migration 639가 "도착 알림 재발송(5분 쿨다운)"을
-- 위해 UNIQUE(request_id, kind)를 일부러 제거했고, 실제로 kind='soon'이 여러 번
-- 쌓여 있다. 여기서 (request_type, request_id, kind) UNIQUE를 다시 걸면 재발송이
-- 막히고, 기존 중복 데이터 때문에 인덱스 생성 자체가 실패한다(2026-09-06 실측).
-- 쿨다운은 API가 created_at을 보고 판단하므로 여기선 조회용 일반 인덱스만 둔다.
CREATE INDEX IF NOT EXISTS idx_arrival_pings_type_request_kind
  ON arrival_pings(request_type, request_id, kind);
