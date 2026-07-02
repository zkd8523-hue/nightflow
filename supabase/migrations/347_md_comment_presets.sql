-- ============================================================================
-- Migration 347: MD 자주 쓰는 오퍼 코멘트 프리셋 (계정 단위, 최대 5개)
-- 날짜: 2026-07-01
-- 설명: OfferSheet에서 MD가 자주 쓰는 멘트를 저장/재사용. 기기 로컬 대신
--       계정 단위 DB 저장으로 여러 기기 동기화.
-- ============================================================================
CREATE TABLE IF NOT EXISTS md_comment_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_presets_md ON md_comment_presets(md_id, created_at);

ALTER TABLE md_comment_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD manages own comment presets" ON md_comment_presets
  FOR ALL
  USING (auth.uid() = md_id)
  WITH CHECK (auth.uid() = md_id);

-- 최대 5개 제한
CREATE OR REPLACE FUNCTION check_comment_preset_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM md_comment_presets WHERE md_id = NEW.md_id) >= 5 THEN
    RAISE EXCEPTION '멘트는 최대 5개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_comment_preset_limit
  BEFORE INSERT ON md_comment_presets
  FOR EACH ROW EXECUTE FUNCTION check_comment_preset_limit();
