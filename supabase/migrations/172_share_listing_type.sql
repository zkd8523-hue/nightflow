-- ============================================
-- Migration 172: 얼리버드 = 조각 + 즉시 매칭 모드
-- ============================================
-- listing_type 'share' 추가, auctions 테이블에 조각 전용 컬럼,
-- share_claims 테이블 신설, auction_templates share 전용 컬럼 추가

-- ============================================================
-- 1) listing_type CHECK 제약 확장 ('share' 추가)
--    NOTE: Migration 073에서 TEXT + CHECK 로 정의됨 (ENUM 아님)
--    제약 이름이 자동 생성되므로 동적으로 찾아 DROP
--    auction_templates 테이블 미존재 케이스도 안전하게 처리
-- ============================================================
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- auctions 테이블의 listing_type CHECK 제약 찾아 DROP
  FOR v_constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'auctions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%listing_type%'
      AND pg_get_constraintdef(oid) ILIKE '%''auction''%'
  LOOP
    EXECUTE format('ALTER TABLE auctions DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;

  -- auction_templates 도 동일하게 처리 (테이블이 존재할 때만)
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'auction_templates') THEN
    FOR v_constraint_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'auction_templates'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%listing_type%'
        AND pg_get_constraintdef(oid) ILIKE '%''auction''%'
    LOOP
      EXECUTE format('ALTER TABLE auction_templates DROP CONSTRAINT %I', v_constraint_name);
    END LOOP;
  END IF;
END $$;

-- 새 CHECK 제약 추가 (share 포함)
ALTER TABLE auctions ADD CONSTRAINT auctions_listing_type_check
  CHECK (listing_type IN ('auction', 'instant', 'share'));

-- auction_templates 가 존재하면 CHECK 제약 추가
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'auction_templates') THEN
    -- listing_type 컬럼이 있는지 확인
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'auction_templates' AND column_name = 'listing_type'
    ) THEN
      ALTER TABLE auction_templates ADD CONSTRAINT auction_templates_listing_type_check
        CHECK (listing_type IN ('auction', 'instant', 'share'));
    END IF;
  END IF;
END $$;

-- ============================================================
-- 2) auctions 테이블 — 조각 전용 컬럼
-- ============================================================
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS total_seats         INTEGER,
  ADD COLUMN IF NOT EXISTS seats_claimed       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_seat      INTEGER,
  ADD COLUMN IF NOT EXISTS share_deadline      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_attendees  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_alcohol        TEXT;

-- share_date: share_deadline 기준 KST 날짜 자동 계산 (타임존 버그 방지)
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS share_date DATE
    GENERATED ALWAYS AS
      ((share_deadline AT TIME ZONE 'Asia/Seoul')::DATE)
    STORED;

-- ============================================================
-- 3) CHECK 제약
-- ============================================================

-- share 타입이면 필수 필드 검증 (share_date 는 GENERATED 자동)
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS share_fields_required;
ALTER TABLE auctions ADD CONSTRAINT share_fields_required
  CHECK (
    listing_type <> 'share' OR (
      total_seats IS NOT NULL AND total_seats BETWEEN 2 AND 20
      AND price_per_seat IS NOT NULL AND price_per_seat > 0
      AND share_deadline IS NOT NULL
    )
  );

-- NF 점유 + 외부 인원 ≤ 정원
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS share_combined_seats_within_total;
ALTER TABLE auctions ADD CONSTRAINT share_combined_seats_within_total
  CHECK (
    listing_type <> 'share' OR (
      seats_claimed + external_attendees <= total_seats
      AND external_attendees >= 0
    )
  );

-- seats_claimed 가 total_seats 초과 불가 (수정 시 정원 하향 방지)
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS share_seats_consistent;
ALTER TABLE auctions ADD CONSTRAINT share_seats_consistent
  CHECK (
    listing_type <> 'share' OR seats_claimed <= total_seats
  );

-- ============================================================
-- 4) MD 1일 1매물 UNIQUE INDEX
--    cancelled / unsold 는 제외 → 실패 시 당일 재도전 허용
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_one_per_day_per_md
  ON auctions (md_id, share_date)
  WHERE listing_type = 'share'
    AND status NOT IN ('cancelled', 'unsold');

-- ============================================================
-- 5) 참여자 있는 매물의 가격·정원 변경 차단 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION protect_share_critical_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.listing_type = 'share' AND OLD.seats_claimed > 0 THEN
    IF NEW.price_per_seat IS DISTINCT FROM OLD.price_per_seat THEN
      RAISE EXCEPTION 'CANNOT_CHANGE_PRICE_AFTER_CLAIMS' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.total_seats IS DISTINCT FROM OLD.total_seats
       AND NEW.total_seats < OLD.total_seats THEN
      RAISE EXCEPTION 'CANNOT_REDUCE_SEATS_AFTER_CLAIMS' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_share_critical_fields ON auctions;
CREATE TRIGGER trg_protect_share_critical_fields
  BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION protect_share_critical_fields();

-- ============================================================
-- 6) share_claims 테이블 (좌석 점유 기록)
-- ============================================================
CREATE TABLE IF NOT EXISTS share_claims (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id        UUID        NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  cancellation_count INTEGER    NOT NULL DEFAULT 0,
  kicked_by_md      BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (auction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_share_claims_auction_active
  ON share_claims (auction_id) WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_share_claims_user
  ON share_claims (user_id);

ALTER TABLE share_claims ENABLE ROW LEVEL SECURITY;

-- 유저는 본인 참여 기록 조회, MD는 자기 매물 참여자 조회
DROP POLICY IF EXISTS "share_claims_select" ON share_claims;
CREATE POLICY "share_claims_select"
  ON share_claims FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.uid() IN (
      SELECT md_id FROM auctions WHERE id = auction_id
    )
  );

DROP POLICY IF EXISTS "share_claims_insert" ON share_claims;
CREATE POLICY "share_claims_insert"
  ON share_claims FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "share_claims_update" ON share_claims;
CREATE POLICY "share_claims_update"
  ON share_claims FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 7) auction_templates — share 전용 컬럼 추가
-- ============================================================
-- 기존 데이터 초기화 + share 전용 컬럼 추가 (테이블 있을 때만)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'auction_templates') THEN
    TRUNCATE TABLE auction_templates;
    ALTER TABLE auction_templates
      ADD COLUMN IF NOT EXISTS total_seats    INTEGER,
      ADD COLUMN IF NOT EXISTS price_per_seat INTEGER,
      ADD COLUMN IF NOT EXISTS main_alcohol   TEXT;
  ELSE
    -- 테이블 자체가 없으면 share 전용으로 신규 생성
    CREATE TABLE auction_templates (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      md_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT        NOT NULL,
      club_id       UUID        REFERENCES clubs(id) ON DELETE SET NULL,
      table_type    TEXT,
      total_seats   INTEGER,
      price_per_seat INTEGER,
      main_alcohol  TEXT,
      includes      TEXT[]      DEFAULT '{}',
      listing_type  TEXT        NOT NULL DEFAULT 'share'
        CHECK (listing_type IN ('auction', 'instant', 'share')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_templates_md ON auction_templates(md_id);
    ALTER TABLE auction_templates ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "MD can manage own templates" ON auction_templates
      FOR ALL USING (auth.uid() = md_id);
  END IF;
END $$;
-- 기존 컬럼(start_price, original_price, duration_minutes 등)은
-- NULL 허용으로 잔존, share 폼에서는 미사용. 추후 deprecated 예정.
