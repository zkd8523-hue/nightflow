-- ============================================================================
-- Migration 302: 조각(share) 옵션/프리셋
-- 날짜: 2026-06-13
-- 배경:
--   조각은 MD에게 상시 모집인데 매번 1일 단위 개별 등록이 부자연스럽다.
--   MD 홍보 메시지는 "메인 200 / 일반 35 / 힙존 9~12" 같은 요일별 고정 가격표다.
--   이를 위해 MD가 자리 등급별 옵션(프리셋)을 저장해두고, 요일표(303)에 배정하면
--   매주 자동으로 조각이 생성(305 cron)되도록 한다.
--
--   옵션 1개 = 조각 1건이 될 묶음 (등급당 조각 1개 원칙).
--   소유 단위는 MD×클럽 (weekly_share_slots·등록 게이트가 클럽 단위라 정합).
--   주류(main_alcohol)는 옵션에서 제외 — 자동생성 시 NULL.
--
-- 참조: 172_share_listing_type.sql (share 필드/제약), 065_auction_templates.sql (개수 제한 트리거)
-- ============================================================================

CREATE TABLE IF NOT EXISTS share_options (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id        UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  label          TEXT,                       -- MD용 식별 라벨 "메인","일반" (선택)
  table_info     TEXT NOT NULL,              -- 자리 설명 (title 생성에 사용)
  total_seats    INTEGER NOT NULL CHECK (total_seats BETWEEN 2 AND 20),
  price_per_seat INTEGER NOT NULL CHECK (price_per_seat > 0),
  includes       TEXT[] NOT NULL DEFAULT '{}',
  md_message     TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,  -- soft delete (배정에 묶인 옵션 보호)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_options_md_club ON share_options(md_id, club_id);

COMMENT ON TABLE share_options IS
  '조각 옵션/프리셋 (MD×클럽, 자리 등급별). 요일표(share_weekday_plan)에 배정되어 자동 생성됨.';

-- updated_at 자동 갱신 (공통 함수 재사용)
DROP TRIGGER IF EXISTS share_options_updated_at ON share_options;
CREATE TRIGGER share_options_updated_at
  BEFORE UPDATE ON share_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- MD×클럽당 최대 6개 제한 (자리 등급 5 + 여유 1). 065 패턴, 단 (md_id, club_id) 기준.
CREATE OR REPLACE FUNCTION check_share_option_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM share_options
        WHERE md_id = NEW.md_id AND club_id = NEW.club_id) >= 6 THEN
    RAISE EXCEPTION '조각 옵션은 클럽당 최대 6개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_share_option_limit ON share_options;
CREATE TRIGGER enforce_share_option_limit
  BEFORE INSERT ON share_options
  FOR EACH ROW EXECUTE FUNCTION check_share_option_limit();

-- RLS: 본인 옵션만 관리
ALTER TABLE share_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own share options" ON share_options
  FOR ALL USING (auth.uid() = md_id);
