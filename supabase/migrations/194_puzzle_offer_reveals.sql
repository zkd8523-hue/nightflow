-- ============================================================================
-- Migration 194: puzzle_offer_reveals — 시크릿 오퍼 긁기 결과 서버 저장
-- 날짜: 2026-05-17
-- 설명: 기존엔 localStorage에만 저장 → 기기/브라우저 바꾸면 다시 긁어야 했음.
--       서버에 (user_id, offer_id) 페어 저장하여 multi-device 동기화.
--       RLS: 본인 행만 INSERT/SELECT (offer 자체 가시성은 puzzle_offers RLS가 담당).
-- ============================================================================

CREATE TABLE IF NOT EXISTS puzzle_offer_reveals (
  user_id     UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  offer_id    UUID NOT NULL REFERENCES puzzle_offers(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_offer_reveals_user ON puzzle_offer_reveals(user_id);

ALTER TABLE puzzle_offer_reveals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own reveals" ON puzzle_offer_reveals;
CREATE POLICY "users read own reveals" ON puzzle_offer_reveals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own reveals" ON puzzle_offer_reveals;
CREATE POLICY "users insert own reveals" ON puzzle_offer_reveals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
