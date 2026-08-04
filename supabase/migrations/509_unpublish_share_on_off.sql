-- ============================================================================
-- Migration 509: 상시 조각을 끄면 미래 발행분도 함께 내린다 (505/507 후속)
-- 날짜: 2026-08-05
-- 배경:
--   토글을 꺼도 is_live=false만 되고, 이미 발행된 미래 조각은 그대로 남아 있었다.
--   MD는 "껐다"고 생각하는데 다음 주 자리가 계속 노출되는 상태 — 실제로 자리를 못 잡으면
--   그대로 노쇼로 이어진다.
--
--   끌 때 아직 방문일이 지나지 않은 발행분을 함께 취소한다. 단 참여자가 이미 있는 건은
--   건드리지 않는다(약속을 일방적으로 깨면 안 됨) — 그건 MD가 개별로 판단해 내리게 한다.
--
--   published_dates에서도 해당 날짜를 빼서, 나중에 다시 켰을 때 재발행되도록 한다.
-- ============================================================================

CREATE OR REPLACE FUNCTION unpublish_my_share_template(
  p_template_id UUID,
  p_dows TEXT[] DEFAULT NULL   -- NULL이면 미래 전체, 값이 있으면 해당 요일만
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  r RECORD;
  v_cancelled INT := 0;
  v_kept INT := 0;
BEGIN
  SELECT md_id INTO v_md FROM auction_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '템플릿을 찾을 수 없어요');
  END IF;
  IF v_md IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('success', false, 'error', '본인 템플릿만 내릴 수 있어요');
  END IF;

  FOR r IN
    SELECT p.id, p.event_date, p.current_count
    FROM puzzles p
    WHERE p.source_template_id = p_template_id
      AND p.status IN ('open', 'selecting')
      AND p.event_date >= v_today
      AND (
        p_dows IS NULL
        OR (CASE EXTRACT(ISODOW FROM p.event_date)::int
              WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed' WHEN 4 THEN 'thu'
              WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' WHEN 7 THEN 'sun' END) = ANY(p_dows)
      )
  LOOP
    -- 참여자가 있으면 남긴다 — 이미 약속이 잡힌 자리를 일방적으로 취소하지 않는다.
    -- (host_is_md는 current_count가 0부터 시작하므로 0보다 크면 실제 참여자가 있는 것)
    IF r.current_count > 0 THEN
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    UPDATE puzzles
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = COALESCE(cancelled_reason, '상시 조각 해제')
      WHERE id = r.id;

    UPDATE auction_templates
      SET published_dates = array_remove(published_dates, r.event_date)
      WHERE id = p_template_id;

    v_cancelled := v_cancelled + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'cancelled', v_cancelled, 'kept', v_kept);
END;
$$;

GRANT EXECUTE ON FUNCTION unpublish_my_share_template(UUID, TEXT[]) TO authenticated;
