-- ============================================================================
-- Migration 437: MD 오퍼 세트(프리셋) — 이름 지정, 구성 원클릭 채움
-- 날짜: 2026-07-09
-- 설명: OfferSheet에서 MD가 매번 주류·테이블 구성을 처음부터 고르는 수고를 덜기
--       위해, 자주 쓰는 오퍼 구성을 이름 붙여 저장/재사용. 계정 단위 DB 저장.
--       md_comment_presets(347, 코멘트만)의 상위 개념 — 클럽/구성/코멘트를 한 번에.
--       가격은 깃발 예산에 고정이라 저장하지 않음.
-- ============================================================================
CREATE TABLE IF NOT EXISTS md_offer_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  club_id    UUID REFERENCES clubs(id) ON DELETE SET NULL,
  includes   TEXT[] NOT NULL DEFAULT '{}',   -- 주류 + 테이블 구성 (OfferSheet includes와 동일 구조)
  comment    TEXT,                           -- 파트너 코멘트 (선택)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_presets_md ON md_offer_presets(md_id, created_at);

ALTER TABLE md_offer_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD manages own offer presets" ON md_offer_presets
  FOR ALL
  USING (auth.uid() = md_id)
  WITH CHECK (auth.uid() = md_id);

-- 최대 10개 제한
CREATE OR REPLACE FUNCTION check_offer_preset_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM md_offer_presets WHERE md_id = NEW.md_id) >= 10 THEN
    RAISE EXCEPTION '오퍼 세트는 최대 10개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_offer_preset_limit
  BEFORE INSERT ON md_offer_presets
  FOR EACH ROW EXECUTE FUNCTION check_offer_preset_limit();
