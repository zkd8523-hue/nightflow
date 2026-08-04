-- ============================================================================
-- Migration 524: 조각 운영권 반납·회수 시 그 주 발행분을 즉시 정리
-- 날짜: 2026-08-05
-- 배경:
--   운영권(weekly_share_slots)은 클럽×주 = 파트너 1명이다. 그런데 자리를 반납해도
--   이미 발행된 그 주 조각은 피드에 그대로 남았다. 파트너는 더 이상 그 클럽 테이블을
--   잡을 권한이 없는데 유저는 계속 참가할 수 있는 상태 — 그대로 노쇼가 된다.
--
--   516의 sweep_live_shares()가 회수하긴 하지만 매일 06:15 한 번이라 최대 하루가 뜬다.
--   반납·회수는 명확한 사건이므로 그 자리에서 정리한다.
--
--   ⚠️ 참여자가 있어도 취소한다. "자리를 못 잡는 파트너의 조각"을 남겨두는 쪽이
--      유저에게 더 나쁘다(당일 현장에서 알게 된다). 대신 참여자에게 알림을 보낸다.
--      — 요일을 끄는 경우(509)와 다르다. 그건 파트너가 계속 운영 중이라 남길 여지가 있다.
--
-- 적용 대상: release_share_slot(본인 반납) / admin_release_share_slot(관리자 회수)
--   admin_assign_share_slot은 이미 차지된 슬롯을 덮어쓰지 않고 거절하므로(309),
--   "기존 보유자가 있는 채로 주인이 바뀌는" 경로가 없어 손대지 않는다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 공용 정리 함수 — 그 주(week_start ~ +6일)의 미래 발행분을 취소
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reclaim_share_publications(
  p_club_id UUID,
  p_md_id UUID,
  p_week_start DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  r RECORD;
  m RECORD;
  v_cancelled INT := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.event_date, p.current_count, p.notes, p.source_template_id
    FROM puzzles p
    WHERE p.club_id = p_club_id
      AND p.leader_id = p_md_id
      AND p.host_is_md = true
      AND p.is_recruiting_party = true
      AND p.status IN ('open', 'selecting')
      AND p.event_date >= GREATEST(v_today, p_week_start)
      AND p.event_date < p_week_start + 7
  LOOP
    UPDATE puzzles
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = COALESCE(cancelled_reason, '클럽 운영권 반납')
      WHERE id = r.id;

    -- 템플릿의 published_dates에서도 빼서, 나중에 자리를 다시 잡으면 재발행되게 한다
    IF r.source_template_id IS NOT NULL THEN
      UPDATE auction_templates
        SET published_dates = array_remove(published_dates, r.event_date)
        WHERE id = r.source_template_id;
    END IF;

    -- 참여자에게는 반드시 알린다 — 약속이 사라졌다는 건 거래 알림이다
    FOR m IN
      SELECT user_id FROM puzzle_members WHERE puzzle_id = r.id AND user_id <> p_md_id
    LOOP
      BEGIN
        PERFORM notify_user_push(
          m.user_id,
          '조각이 취소됐어요',
          COALESCE(r.notes, '조각') || ' · ' || to_char(r.event_date, 'MM/DD') || ' 자리가 취소됐어요',
          jsonb_build_object('type', 'share_cancelled', 'puzzle_id', r.id::TEXT),
          '/flags/' || r.id::TEXT
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'reclaim_share_publications: notify failed for %: %', m.user_id, SQLERRM;
      END;
    END LOOP;

    v_cancelled := v_cancelled + 1;
  END LOOP;

  RETURN v_cancelled;
END;
$$;

COMMENT ON FUNCTION reclaim_share_publications IS
  '클럽 운영권을 잃은 파트너의 그 주 조각 발행분을 즉시 취소하고 참여자에게 알린다(Migration 524).';

-- ----------------------------------------------------------------------------
-- 2) 본인 반납 — 299 본문 + 정리 호출
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_share_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
  v_club UUID;
  v_week DATE;
  v_cancelled INT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT md_id, club_id, week_start INTO v_owner, v_club, v_week
    FROM weekly_share_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각 자리를 찾을 수 없어요');
  END IF;
  IF v_owner <> v_md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 조각 자리만 해제할 수 있어요');
  END IF;

  -- 슬롯을 지우기 전에 발행분부터 정리 (지운 뒤엔 어느 주였는지 알 수 없다)
  v_cancelled := reclaim_share_publications(v_club, v_owner, v_week);

  DELETE FROM weekly_share_slots WHERE id = p_slot_id;
  RETURN jsonb_build_object('success', true, 'cancelled', v_cancelled);
END;
$$;

COMMENT ON FUNCTION release_share_slot(UUID) IS
  '조각 슬롯 해제 (본인 슬롯만). 그 주 발행분도 함께 취소(Migration 524).';

-- ----------------------------------------------------------------------------
-- 3) 관리자 회수 — 309 본문 + 정리 호출
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_release_share_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_deleted INT;
  v_owner UUID;
  v_club UUID;
  v_week DATE;
  v_cancelled INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요해요');
  END IF;

  SELECT md_id, club_id, week_start INTO v_owner, v_club, v_week
    FROM weekly_share_slots WHERE id = p_slot_id;
  IF v_owner IS NOT NULL THEN
    v_cancelled := reclaim_share_publications(v_club, v_owner, v_week);
  END IF;

  DELETE FROM weekly_share_slots WHERE id = p_slot_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '조각 자리를 찾을 수 없어요');
  END IF;

  RETURN jsonb_build_object('success', true, 'cancelled', v_cancelled);
END;
$$;

COMMENT ON FUNCTION admin_release_share_slot(UUID) IS
  '어드민 전용: 조각 슬롯 해제. 기존 보유자의 그 주 발행분도 함께 취소(Migration 524).';
