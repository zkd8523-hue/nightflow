-- ============================================================================
-- Migration 228: MD 깃발 지역 구독 + 푸시 알림
-- 날짜: 2026-05-24
-- 설명:
--   MD가 지역별로 깃발 알림 수신 여부를 설정. 새 깃발(puzzles INSERT)이
--   해당 지역에 꽂히면 구독한 MD 전원에게 FCM 푸시.
--
--   매칭 규칙:
--     - 깃발 area = '강남/홍대/...' → 같은 area 구독자에게 발송
--     - 깃발 area = '서울 어디든' → 서울권(강남/홍대/이태원/건대) 1개 이상
--                                  구독자에게 발송 (중복 제거)
--     - 본인이 만든 깃발은 제외 (md_id != leader_id)
-- ============================================================================

-- ============================================================================
-- 1) 구독 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS md_puzzle_area_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN (
    '강남', '홍대', '이태원', '건대',
    '부산', '대구', '인천', '광주', '대전', '울산', '세종'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(md_id, area)
);

CREATE INDEX IF NOT EXISTS idx_md_puzzle_area_subs_area ON md_puzzle_area_subs(area);
CREATE INDEX IF NOT EXISTS idx_md_puzzle_area_subs_md ON md_puzzle_area_subs(md_id);

ALTER TABLE md_puzzle_area_subs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD can manage own area subscriptions"
  ON md_puzzle_area_subs
  FOR ALL USING (auth.uid() = md_id);

COMMENT ON TABLE md_puzzle_area_subs IS 'MD 깃발(puzzle) 지역별 푸시 구독';

-- ============================================================================
-- 2) atomic 갱신 RPC
--    클라이언트에서 areas 배열을 통째로 넘기면 DELETE+INSERT로 동기화
-- ============================================================================
CREATE OR REPLACE FUNCTION set_md_puzzle_areas(p_areas TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증 필요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 권한 필요');
  END IF;

  DELETE FROM md_puzzle_area_subs WHERE md_id = v_md_id;

  IF p_areas IS NOT NULL AND array_length(p_areas, 1) > 0 THEN
    INSERT INTO md_puzzle_area_subs (md_id, area)
    SELECT v_md_id, unnest(p_areas)
    ON CONFLICT (md_id, area) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_md_puzzle_areas(TEXT[]) IS 'MD 본인의 깃발 구독 지역 atomic 갱신';

-- ============================================================================
-- 3) 트리거: 새 깃발 → 매칭된 MD 푸시
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_puzzle_push_md_area_match()
RETURNS TRIGGER AS $$
DECLARE
  v_md RECORD;
  v_seoul_areas TEXT[] := ARRAY['강남', '홍대', '이태원', '건대'];
  v_body TEXT;
  v_budget_text TEXT;
BEGIN
  -- open 상태로 새로 들어오는 깃발만 처리
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  v_budget_text := to_char(NEW.budget_per_person, 'FM999,999,999');
  v_body := format('%s · %s명 · 1인 %s원', NEW.area, NEW.target_count, v_budget_text);

  IF NEW.area = '서울 어디든' THEN
    -- 서울권 1개라도 구독한 MD (중복 제거)
    FOR v_md IN
      SELECT DISTINCT md_id
      FROM md_puzzle_area_subs
      WHERE area = ANY(v_seoul_areas)
        AND md_id <> NEW.leader_id
    LOOP
      PERFORM notify_user_push(
        v_md.md_id,
        '🚩 새 깃발 (서울 어디든)',
        v_body,
        jsonb_build_object(
          'type', 'puzzle_new_in_area',
          'puzzle_id', NEW.id::TEXT,
          'area', NEW.area
        ),
        '/flags/' || NEW.id::TEXT
      );
    END LOOP;
  ELSE
    -- 정확히 같은 area 구독자
    FOR v_md IN
      SELECT md_id
      FROM md_puzzle_area_subs
      WHERE area = NEW.area
        AND md_id <> NEW.leader_id
    LOOP
      PERFORM notify_user_push(
        v_md.md_id,
        '🚩 새 깃발 · ' || NEW.area,
        v_body,
        jsonb_build_object(
          'type', 'puzzle_new_in_area',
          'puzzle_id', NEW.id::TEXT,
          'area', NEW.area
        ),
        '/flags/' || NEW.id::TEXT
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS puzzle_push_md_area_match ON puzzles;
CREATE TRIGGER puzzle_push_md_area_match
  AFTER INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_push_md_area_match();

COMMENT ON FUNCTION trg_puzzle_push_md_area_match()
  IS '새 깃발 INSERT 시 구독 지역 매칭 MD에게 FCM 푸시. 서울 어디든은 서울권 구독자 전부.';
