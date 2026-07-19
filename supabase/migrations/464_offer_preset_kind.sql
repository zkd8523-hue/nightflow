-- ============================================================================
-- Migration 464: 오퍼 템플릿 종류 분리 (깃발 / 조각)
-- 날짜: 2026-07-19
-- 설명: md_offer_presets는 지금까지 깃발(고정가) 오퍼 전용이었음. 조각(파티원 모집)
--       오퍼에도 템플릿을 붙이면서, 두 종류가 한 목록에 섞이지 않도록 offer_kind로
--       구분한다. 기존 행은 모두 깃발이므로 기본값 'flag'.
--         - 'flag'  : 깃발 오퍼 (클럽 + 주류/구성 + 코멘트)
--         - 'share' : 조각 오퍼 (클럽 + 코멘트) — 인원·가격 실시간 변동이라 구성은 저장 안 함
-- ============================================================================
ALTER TABLE md_offer_presets
  ADD COLUMN IF NOT EXISTS offer_kind TEXT NOT NULL DEFAULT 'flag'
  CHECK (offer_kind IN ('flag', 'share'));

-- 종류별 조회가 잦으므로 인덱스에 offer_kind 포함
CREATE INDEX IF NOT EXISTS idx_offer_presets_md_kind
  ON md_offer_presets(md_id, offer_kind, created_at);

-- 최대 10개 제한을 종류별로 분리 (깃발 10개 + 조각 10개 각각).
-- 기존 트리거는 md 전체를 세어 UI의 "X/10"(종류별) 표시와 어긋나므로 재정의.
CREATE OR REPLACE FUNCTION check_offer_preset_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM md_offer_presets
      WHERE md_id = NEW.md_id AND offer_kind = NEW.offer_kind) >= 10 THEN
    RAISE EXCEPTION '오퍼 세트는 최대 10개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
