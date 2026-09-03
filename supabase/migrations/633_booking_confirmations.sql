-- ============================================================================
-- Migration 633: 예약 확정서 (booking_confirmations)
--
-- 배경: 지금 확정 정보(테이블 등급/포함 내역/확정가/담당 MD)를 담을 곳이 없어서
--      운영자가 카톡·전화로 확정한 내용이 시스템 밖에 남는다. 손님에게 보낼
--      확인서도 매번 손으로 만들어야 한다.
--
-- 구조: foreign_requests(요청) 1 : 1 booking_confirmations(확정).
--      요청은 손님이 쓴 희망사항, 확정은 MD와 합의된 실제 내용이라 분리한다.
--      budget(희망가)과 total_price(확정가)를 같은 칸에 두면 구분이 사라진다.
--
-- 공유: public_token으로 로그인 없이 열리는 링크를 만든다. 손님은 WhatsApp으로
--      링크만 받고 앱/로그인 없이 확인서를 본다(한국 앱스토어 심사 미완료).
--
-- 참조: 454_foreign_requests.sql, 632_arrival_pings.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES foreign_requests(id) ON DELETE CASCADE,

  -- 확정 클럽 — 요청은 최대 3곳을 고르므로 어디로 성사됐는지 별도로 남긴다.
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

  -- 사람이 읽는 예약번호. 클럽 접두 2자 + 4자리 (예: AC-4823).
  -- 클럽×날짜 안에서만 유일하면 충분하다(문서에 날짜가 함께 적힌다).
  ref_no TEXT NOT NULL,

  table_info TEXT,                    -- "R zone · 2 tables"
  capacity_note TEXT,                 -- "8~15인 수용"
  includes TEXT[] NOT NULL DEFAULT '{}',  -- ["돔페리뇽 루미너스 2", ...]
  total_price INTEGER CHECK (total_price IS NULL OR total_price > 0),
  arrival_time TEXT,                  -- "23:00" 등 자유 표기
  guest_request TEXT,                 -- "VIP experience · 대기 없는 입장"
  internal_memo TEXT,                 -- 운영자 전용(손님·클럽 미노출)

  -- 로그인 없이 여는 공유 링크 토큰
  public_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_conf_request ON booking_confirmations(request_id);
CREATE INDEX IF NOT EXISTS idx_booking_conf_token ON booking_confirmations(public_token);

COMMENT ON TABLE booking_confirmations IS
  '예약 확정 내용. foreign_requests와 1:1. 요청(희망)과 확정(합의)을 분리해 담는다.';
COMMENT ON COLUMN booking_confirmations.public_token IS
  '로그인 없이 확인서를 여는 링크 토큰. /booking/[token]';
COMMENT ON COLUMN booking_confirmations.internal_memo IS
  '운영자 전용 메모. 손님용·클럽용 확인서 어디에도 노출하지 않는다.';

DROP TRIGGER IF EXISTS booking_confirmations_updated_at ON booking_confirmations;
CREATE TRIGGER booking_confirmations_updated_at
  BEFORE UPDATE ON booking_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE booking_confirmations ENABLE ROW LEVEL SECURITY;

-- 손님은 비로그인으로 링크를 열기 때문에 클라이언트 조회를 허용하지 않는다.
-- 공유 페이지는 서버(service role)에서 토큰으로 읽어 렌더한다.
CREATE POLICY "admin manages booking confirmations" ON booking_confirmations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 담당 MD는 본인 배정 건만 조회
CREATE POLICY "assigned md reads own confirmation" ON booking_confirmations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foreign_requests fr
      WHERE fr.id = booking_confirmations.request_id
        AND fr.assigned_md_id = auth.uid()
    )
  );
