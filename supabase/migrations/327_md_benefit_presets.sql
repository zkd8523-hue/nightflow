-- ============================================================================
-- Migration 327: MD 고정 혜택 프리셋 (게스트 간판 직접입력 재사용)
-- 날짜: 2026-06-26
-- 배경:
--   게스트 간판 혜택은 시스템 프리셋(무료입장/프리드링크) 2개만 칩으로 고정돼
--   있고, 자주 쓰는 문구는 매번 '직접입력'으로 다시 쳐야 했다.
--   MD가 직접입력한 혜택을 '고정'하면 본인 전용 프리셋 칩으로 계속 재사용.
--
-- 설계:
--   md_benefit_presets — MD 단위(클럽/슬롯 무관) 텍스트 라벨 목록.
--   혜택 실제 데이터는 weekly_hotdeal_slots.benefits_by_dow에 그대로 저장되고,
--   이 테이블은 "추천 칩 목록"만 담는다(데이터 손실 위험 없음).
-- ============================================================================

CREATE TABLE IF NOT EXISTS md_benefit_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 같은 MD가 같은 문구를 두 번 고정하지 못하게
  CONSTRAINT md_benefit_presets_md_label_key UNIQUE(md_id, label)
);

CREATE INDEX IF NOT EXISTS idx_benefit_presets_md ON md_benefit_presets(md_id);

COMMENT ON TABLE md_benefit_presets IS
  'MD 고정 혜택 프리셋 (게스트 간판 직접입력 재사용용 칩 목록). MD 단위.';

-- RLS: 본인 프리셋만 관리
ALTER TABLE md_benefit_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MD can manage own benefit presets" ON md_benefit_presets;
CREATE POLICY "MD can manage own benefit presets" ON md_benefit_presets
  FOR ALL
  USING (auth.uid() = md_id)
  WITH CHECK (auth.uid() = md_id);
