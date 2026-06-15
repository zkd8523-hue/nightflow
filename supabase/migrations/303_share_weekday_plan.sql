-- ============================================================================
-- Migration 303: 조각(share) 요일표 배정
-- 날짜: 2026-06-13
-- 배경:
--   share_options(302)를 월~일 요일에 배정하는 영속 템플릿.
--   요일칸에 옵션 배치 = 그 요일 운영(ON), 빈칸 = 그날 없음(OFF). 별도 ON/OFF 토글 없음.
--   한 요일에 여러 옵션(메인+일반) 배정 가능 = 여러 행.
--   날짜 없이 요일 키만 가짐 = 매주 반복(영속). 305 cron이 이번 주 날짜로 환산해 생성.
--
--   dow 키는 게스트 간판(236)·getBusinessDowKey()와 동일한 'mon'~'sun' 규약 재사용.
--
-- 참조: 302_share_options.sql, 236_hotdeal_week_unit.sql (dow 키 규약)
-- ============================================================================

CREATE TABLE IF NOT EXISTS share_weekday_plan (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  dow        TEXT NOT NULL CHECK (dow IN ('mon','tue','wed','thu','fri','sat','sun')),
  option_id  UUID NOT NULL REFERENCES share_options(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (md_id, club_id, dow, option_id)
);

CREATE INDEX IF NOT EXISTS idx_share_weekday_plan_md_club ON share_weekday_plan(md_id, club_id);

COMMENT ON TABLE share_weekday_plan IS
  '조각 요일표 — 요일(dow)별 share_options 배정. 매주 반복되는 영속 템플릿. cron이 이번 주 날짜로 환산.';

-- RLS: 본인 배정만 관리
ALTER TABLE share_weekday_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own weekday plan" ON share_weekday_plan
  FOR ALL USING (auth.uid() = md_id);

-- ----------------------------------------------------------------------------
-- RPC: set_share_weekday_plan — 특정 (클럽, 요일)의 옵션 배정을 통째 교체(upsert)
--   요일칸에서 옵션 멀티셀렉트 후 저장 시 호출. 기존 행 삭제 후 새 배열로 재삽입.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_share_weekday_plan(
  p_club_id   UUID,
  p_dow       TEXT,
  p_option_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_opt UUID;
  v_idx INTEGER := 0;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한이 필요해요');
  END IF;

  IF p_dow NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
    RETURN jsonb_build_object('success', false, 'error', '요일 값이 올바르지 않아요');
  END IF;

  -- 이 (MD, 클럽, 요일)의 기존 배정 전부 삭제
  DELETE FROM share_weekday_plan
   WHERE md_id = v_md_id AND club_id = p_club_id AND dow = p_dow;

  -- 새 배열로 재삽입 (옵션이 본인 소유인지 + 같은 클럽인지 검증)
  FOREACH v_opt IN ARRAY COALESCE(p_option_ids, ARRAY[]::UUID[])
  LOOP
    IF EXISTS (
      SELECT 1 FROM share_options
       WHERE id = v_opt AND md_id = v_md_id AND club_id = p_club_id AND is_active
    ) THEN
      INSERT INTO share_weekday_plan (md_id, club_id, dow, option_id, sort_order)
      VALUES (v_md_id, p_club_id, p_dow, v_opt, v_idx)
      ON CONFLICT (md_id, club_id, dow, option_id) DO NOTHING;
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_idx);
END;
$$;

COMMENT ON FUNCTION set_share_weekday_plan(UUID, TEXT, UUID[]) IS
  '조각 요일표 배정 교체 — (클럽,요일)의 옵션 배정을 새 배열로 통째 upsert. 본인 소유·동일 클럽 옵션만.';
