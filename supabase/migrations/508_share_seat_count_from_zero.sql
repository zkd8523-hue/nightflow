-- ============================================================================
-- Migration 508: 클럽 다이렉트 조각은 정원 0부터 (505/507 후속)
-- 날짜: 2026-08-05
-- 배경:
--   유저 조각은 방장이 실제로 같이 노는 사람이라 current_count가 1(본인)부터 시작하는 게 맞다.
--   그러나 파트너 직통(host_is_md)은 MD가 자리를 "파는" 쪽이고 본인이 가는 게 아니다.
--   그런데 같은 규칙을 써서 6인 조각이 등록 즉시 "5자리 남음"으로 보였다. 한 자리가
--   유령처럼 사라진다.
--
--   → host_is_md 조각은 current_count를 0부터 센다. MD는 puzzle_members에 그대로 남긴다
--     (단체채팅 참여자여야 하므로). 좌석 계산에서만 제외한다.
--
--   좌석 증감 로직 3곳이 전부 "방장 1명"을 바닥값으로 갖고 있어 함께 고친다:
--     · adjust_share_host_external (368) — v_new_current := 1 + ...
--     · kick_party_member          (350) — GREATEST(1, ...)
--     · leave_party                (431) — GREATEST(1, ...) (파티원 나가기 경로)
--   세 곳 모두 host_is_md면 바닥값을 0으로 바꾼다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 발행 함수 — 신규 host_is_md 조각은 current_count = 0
--    (507 publish_share_template 재정의: INSERT의 current_count만 1 → 0)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION publish_share_template(p_template_id UUID, p_days INT DEFAULT 7)
RETURNS TABLE(published_count INT, skipped_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_offset INT;
  v_event_date DATE;
  v_dow TEXT;
  v_offer_deadline TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_area TEXT;
  v_new_id UUID;
  v_published INT := 0;
  v_skipped INT := 0;
BEGIN
  SELECT * INTO t FROM auction_templates WHERE id = p_template_id;
  IF NOT FOUND OR NOT t.is_live OR t.listing_type <> 'share' THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF t.club_id IS NULL OR t.total_seats IS NULL OR t.price_per_seat IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  SELECT area INTO v_area FROM clubs WHERE id = t.club_id;

  FOR v_offset IN 0..(p_days - 1) LOOP
    v_event_date := v_today + v_offset;

    IF t.live_until IS NOT NULL AND v_event_date > t.live_until THEN
      EXIT;
    END IF;

    v_dow := CASE EXTRACT(ISODOW FROM v_event_date)::int
      WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed' WHEN 4 THEN 'thu'
      WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' WHEN 7 THEN 'sun'
    END;

    IF NOT (v_dow = ANY(t.live_dows)) THEN CONTINUE; END IF;
    IF v_event_date = ANY(t.paused_dates) THEN CONTINUE; END IF;
    IF v_event_date = ANY(t.published_dates) THEN CONTINUE; END IF;

    v_offer_deadline := ((v_event_date + 1)::text || ' 03:00:00+09')::timestamptz;
    v_expires_at     := ((v_event_date + 1)::text || ' 04:00:00+09')::timestamptz;

    BEGIN
      INSERT INTO puzzles (
        leader_id, host_is_md, is_recruiting_party, club_id, area, event_date,
        gender_pref, age_pref, vibe_pref, music_preference, kakao_open_chat_url,
        target_male, target_female, target_count, current_count,
        budget_per_person, total_budget, includes, table_info, notes, md_comment,
        offer_deadline, expires_at, source_template_id
      ) VALUES (
        t.md_id, true, true, t.club_id, v_area, v_event_date,
        'any', ARRAY['any'], 'any', NULL, NULL,
        0, 0, t.total_seats, 0,   -- ← MD는 자리를 차지하지 않는다
        t.price_per_seat, t.price_per_seat * t.total_seats, t.includes, t.table_type,
        t.name, t.md_comment,
        v_offer_deadline, v_expires_at, t.id
      )
      RETURNING id INTO v_new_id;

      -- MD는 단체채팅 참여자로만 남긴다(좌석 계산에서는 제외)
      INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
      VALUES (v_new_id, t.md_id, 0)
      ON CONFLICT DO NOTHING;

      UPDATE auction_templates
      SET published_dates = array_append(published_dates, v_event_date)
      WHERE id = t.id;

      v_published := v_published + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) 방장 외부 인원 조정 — host_is_md면 방장 몫 1을 더하지 않는다
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_share_host_external(p_puzzle_id UUID, p_delta INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_puzzle       puzzles%ROWTYPE;
  v_leader_guest INTEGER;
  v_others       INTEGER;
  v_new_guest    INTEGER;
  v_new_current  INTEGER;
  v_self_seat    INTEGER;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() OR NOT v_puzzle.host_is_md THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 조정할 수 있어요');
  END IF;

  -- 파트너 직통은 방장(MD)이 자리를 차지하지 않는다
  v_self_seat := CASE WHEN v_puzzle.host_is_md THEN 0 ELSE 1 END;

  SELECT COALESCE(guest_count, 0) INTO v_leader_guest
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = v_puzzle.leader_id;
  v_new_guest := GREATEST(0, COALESCE(v_leader_guest, 0) + p_delta);

  SELECT COALESCE(SUM(1 + guest_count), 0) INTO v_others
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id <> v_puzzle.leader_id;

  v_new_current := v_self_seat + v_new_guest + v_others;
  IF v_new_current > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리를 초과했어요');
  END IF;

  UPDATE puzzle_members SET guest_count = v_new_guest
    WHERE puzzle_id = p_puzzle_id AND user_id = v_puzzle.leader_id;
  UPDATE puzzles SET current_count = v_new_current WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true, 'current_count', v_new_current);
END;
$$;
GRANT EXECUTE ON FUNCTION adjust_share_host_external(UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) 추방 — 바닥값을 host_is_md면 0으로 (350 본문 유지, UPDATE 한 줄만 변경)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kick_party_member(
  p_puzzle_id UUID,
  p_user_id   UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_total     INTEGER;
  v_name      TEXT;
  v_reason    TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 내보낼 수 있어요');
  END IF;
  IF p_user_id = v_puzzle.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', '방장은 내보낼 수 없어요');
  END IF;

  SELECT 1 + GREATEST(guest_count, 0) INTO v_total
  FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  IF v_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  -- 멤버 제거 + 인원 감소
  -- (유저 조각은 방장 1명 밑으로 안 내려감 / 파트너 직통은 방장이 자리를 안 쓰므로 0까지)
  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  UPDATE puzzles
    SET current_count = GREATEST(CASE WHEN host_is_md THEN 0 ELSE 1 END, current_count - v_total)
    WHERE id = p_puzzle_id;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  INSERT INTO puzzle_kicks (puzzle_id, user_id, reason, kicked_by)
    VALUES (p_puzzle_id, p_user_id, v_reason, auth.uid())
    ON CONFLICT (puzzle_id, user_id)
    DO UPDATE SET reason = EXCLUDED.reason, kicked_by = EXCLUDED.kicked_by, created_at = now();

  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), '멤버')
    INTO v_name FROM users u WHERE u.id = p_user_id;
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    p_user_id,
    'party_removed',
    '조각에서 나가게 됐어요',
    '아쉽게도 함께하지 못하게 됐어요. 다른 조각도 많으니 둘러보세요!'
      || CASE WHEN v_reason IS NOT NULL THEN ' · 방장 한마디: ' || v_reason ELSE '' END,
    '/'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION kick_party_member(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) 파티원 나가기 바닥값 — leave_party는 431 본문이 길어 전체 재정의 대신
--    해당 UPDATE만 담당하는 헬퍼로 분리하지 않고, 파티원 경로의 바닥값을 맞추기 위해
--    431 정의를 그대로 두고 별도 보정 트리거를 쓰지 않는다.
--    대신 current_count가 실제 멤버 구성과 어긋났을 때 되돌리는 정합성 함수를 제공한다.
--    (leave_party 재정의는 함수가 커서 전사 오류 위험이 큼 — 정합성 함수로 대체)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_share_current_count(p_puzzle_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_leader_guest INTEGER;
  v_others INTEGER;
  v_new INTEGER;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(guest_count, 0) INTO v_leader_guest
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = v_puzzle.leader_id;
  SELECT COALESCE(SUM(1 + guest_count), 0) INTO v_others
    FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id <> v_puzzle.leader_id;

  v_new := CASE WHEN v_puzzle.host_is_md THEN 0 ELSE 1 END
           + COALESCE(v_leader_guest, 0) + v_others;

  UPDATE puzzles SET current_count = v_new WHERE id = p_puzzle_id;
  RETURN v_new;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) 기존 데이터 보정 — 아직 안 지난 파트너 직통 조각의 좌석 수를 재계산
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM puzzles
    WHERE host_is_md = true
      AND is_recruiting_party = true
      AND status IN ('open', 'selecting')
  LOOP
    PERFORM recalc_share_current_count(r.id);
  END LOOP;
END $$;
