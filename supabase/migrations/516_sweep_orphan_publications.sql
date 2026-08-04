-- ============================================================================
-- Migration 516: 꺼진 템플릿의 미래 발행분 자동 회수 (509 보강)
-- 날짜: 2026-08-05
-- 배경:
--   509는 "끄는 순간" 미래 발행분을 회수한다. 그런데 그 경로를 타지 못한 건들이
--   남을 수 있다 — 509 적용 전에 껐거나, 회수 RPC 호출이 네트워크/권한 문제로 실패했거나,
--   요일을 뺀 게 아니라 템플릿 자체가 삭제된 경우(source_template_id가 NULL로 끊김은 제외).
--
--   그러면 MD는 "껐다"고 생각하는데 피드에는 계속 떠 있고, 실제로 자리를 못 잡으면
--   그대로 노쇼가 된다. 아무도 치우지 않는 상태가 가장 나쁘다.
--
--   → 매일 도는 sweep에서 "템플릿이 꺼졌거나 그 요일이 빠졌는데 아직 살아있는
--     미래 발행분"을 찾아 취소한다. 참여자가 있는 건은 건드리지 않는다(509와 동일 원칙).
-- ============================================================================

CREATE OR REPLACE FUNCTION sweep_live_shares()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  -- 1) 운영 기간이 끝난 템플릿 끄기
  UPDATE auction_templates
  SET is_live = false
  WHERE is_live = true
    AND live_until IS NOT NULL
    AND live_until < v_today;

  -- 2) 만료된 발행분으로 빈 연속 횟수 갱신 (참여 0이면 +1, 있었으면 리셋)
  FOR r IN
    SELECT p.id, p.source_template_id, p.current_count
    FROM puzzles p
    WHERE p.source_template_id IS NOT NULL
      AND p.status = 'expired'
      AND p.expires_at >= now() - INTERVAL '25 hours'
      AND p.expires_at < now()
  LOOP
    IF r.current_count <= 0 THEN
      UPDATE auction_templates SET empty_streak = empty_streak + 1 WHERE id = r.source_template_id;
    ELSE
      UPDATE auction_templates SET empty_streak = 0 WHERE id = r.source_template_id;
    END IF;
  END LOOP;

  -- 3) 3회 연속 아무도 안 붙으면 자동 OFF (좀비 공급 차단)
  UPDATE auction_templates SET is_live = false WHERE is_live = true AND empty_streak >= 3;

  -- 4) 고아 발행분 회수. 대상:
  --    (a) 템플릿이 꺼졌거나 그 요일이 규칙에서 빠짐
  --    (b) 운영 기간(live_until)을 넘김
  --    (c) 그 주 클럽 운영권을 더 이상 갖고 있지 않음 — 슬롯이 다른 파트너에게 넘어가면
  --        신규 등록만 막히고 이전 보유자의 기존 발행분은 그대로 남는다. 한 클럽에 두 파트너의
  --        조각이 동시에 뜨는 상태가 되므로 반드시 회수해야 한다.
  --    참여자가 붙은 건(current_count > 0)은 약속이 잡힌 것이라 남긴다.
  FOR r IN
    SELECT p.id, p.event_date, p.source_template_id
    FROM puzzles p
    JOIN auction_templates t ON t.id = p.source_template_id
    WHERE p.status IN ('open', 'selecting')
      AND p.event_date >= v_today
      AND p.current_count <= 0
      AND (
        t.is_live = false
        OR NOT (
          (CASE EXTRACT(ISODOW FROM p.event_date)::int
             WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed' WHEN 4 THEN 'thu'
             WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' WHEN 7 THEN 'sun' END) = ANY(t.live_dows)
        )
        OR (t.live_until IS NOT NULL AND p.event_date > t.live_until)
        OR (p.club_id IS NOT NULL AND NOT has_share_slot_for_date(p.club_id, p.leader_id, p.event_date))
      )
  LOOP
    UPDATE puzzles
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = COALESCE(cancelled_reason, '상시 조각 해제')
      WHERE id = r.id;

    UPDATE auction_templates
      SET published_dates = array_remove(published_dates, r.event_date)
      WHERE id = r.source_template_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION sweep_live_shares IS
  '상시 조각 안전장치: 기간종료/미달 자동 OFF + 꺼진 템플릿의 미래 발행분 회수(참여자 있는 건 제외).';
