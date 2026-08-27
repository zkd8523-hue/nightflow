-- ============================================================================
-- Migration 600: 조각에 offer_deadline을 넣지 않는다 (selecting 오염 차단)
-- 날짜: 2026-08-28
-- 배경:
--   publish_share_template()이 조각을 만들 때 깃발과 똑같이 offer_deadline을
--   (행사 다음날 새벽 3시)로 채워 넣었다. 그런데 조각은 MD가 고정가로 올리는
--   방이라 애초에 받을 오퍼가 없다 — "오퍼 마감 → 60분 검토(selecting) → 만료"
--   라는 깃발 전용 2단계 흐름을 탈 이유가 전혀 없다.
--
--   결과: notify-puzzle-events의 handleOfferDeadline()이 offer_deadline 도래분을
--   긁어가면서 조각까지 status='selecting'으로 바꿔놨다. 실제로 오퍼 0건인
--   조각 10건이 selecting으로 남아 있었고, 방장(MD)에게는 "⏰ 검토 중인 깃발이
--   있어요 / 마지막 선택 기회!" 시트가 떴다. 고를 오퍼가 없는데 선택하라는 안내다.
--
--   offer_deadline을 NULL로 두면 위 cron 쿼리의 `.not("offer_deadline","is",null)`
--   조건에서 자연히 빠진다. expires_at(행사 다음날 새벽 4시)은 조각의 실제 만료
--   시각이므로 그대로 둔다 — expire-puzzles가 open → expired로 바로 닫는다.
--
--   512 본문 그대로 + INSERT의 offer_deadline 자리만 NULL.
-- ============================================================================

DROP FUNCTION IF EXISTS publish_share_template(UUID, INT);

CREATE FUNCTION publish_share_template(p_template_id UUID, p_days INT DEFAULT 7)
RETURNS TABLE(published_count INT, skipped_count INT, first_error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t RECORD;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_offset INT;
  v_event_date DATE;
  v_dow TEXT;
  v_expires_at TIMESTAMPTZ;
  v_area TEXT;
  v_new_id UUID;
  v_published INT := 0;
  v_skipped INT := 0;
  v_err TEXT := NULL;
BEGIN
  SELECT * INTO t FROM auction_templates WHERE id = p_template_id;
  IF NOT FOUND OR NOT t.is_live OR t.listing_type <> 'share' THEN
    RETURN QUERY SELECT 0, 0, NULL::TEXT;
    RETURN;
  END IF;

  IF t.club_id IS NULL OR t.total_seats IS NULL OR t.price_per_seat IS NULL THEN
    RETURN QUERY SELECT 0, 0, '클럽·인원·가격을 먼저 채워주세요'::TEXT;
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

    -- 조각은 offer_deadline을 두지 않는다 (600) — 아래 INSERT에서 NULL로 넣는다.
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
        0, 0, t.total_seats, 0,
        t.price_per_seat, t.price_per_seat * t.total_seats, t.includes, t.table_type,
        t.name, t.md_comment,
        NULL, v_expires_at, t.id
      )
      RETURNING id INTO v_new_id;

      INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
      VALUES (v_new_id, t.md_id, 0)
      ON CONFLICT DO NOTHING;

      UPDATE auction_templates
      SET published_dates = array_append(published_dates, v_event_date)
      WHERE id = t.id;

      v_published := v_published + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      IF v_err IS NULL THEN v_err := SQLERRM; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped, v_err;
END;
$$;

-- 전체 순회(cron)도 새 시그니처에 맞춰 재정의
CREATE OR REPLACE FUNCTION publish_live_shares(p_days INT DEFAULT 7)
RETURNS TABLE(published_count INT, skipped_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_res RECORD;
  v_published INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM auction_templates WHERE is_live = true AND listing_type = 'share'
  LOOP
    SELECT * INTO v_res FROM publish_share_template(r.id, p_days);
    v_published := v_published + COALESCE(v_res.published_count, 0);
    v_skipped := v_skipped + COALESCE(v_res.skipped_count, 0);
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped;
END;
$$;

-- 클라이언트용 — 사유를 error 필드로 함께 전달
CREATE OR REPLACE FUNCTION publish_my_share_template(p_template_id UUID, p_days INT DEFAULT 7)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md UUID;
  v_res RECORD;
BEGIN
  SELECT md_id INTO v_md FROM auction_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '템플릿을 찾을 수 없어요');
  END IF;
  IF v_md IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('success', false, 'error', '본인 템플릿만 발행할 수 있어요');
  END IF;

  SELECT * INTO v_res FROM publish_share_template(p_template_id, p_days);
  RETURN json_build_object(
    'success', true,
    'published', COALESCE(v_res.published_count, 0),
    'skipped', COALESCE(v_res.skipped_count, 0),
    'reason', v_res.first_error
  );
END;
$$;

GRANT EXECUTE ON FUNCTION publish_my_share_template(UUID, INT) TO authenticated;

-- ── 기존 오염분 정리 ────────────────────────────────────────────────────────
-- 이미 selecting으로 넘어간 조각을 되돌린다. 오퍼가 하나도 없는 건만 대상으로
-- 삼아, 혹시라도 오퍼를 받은 방(정상 검토 중)은 건드리지 않는다.
UPDATE puzzles p
   SET status = CASE WHEN p.expires_at <= now() THEN 'expired' ELSE 'open' END
 WHERE p.status = 'selecting'
   AND p.is_recruiting_party = true
   AND NOT EXISTS (
     SELECT 1 FROM puzzle_offers o
      WHERE o.puzzle_id = p.id AND o.status = 'pending'
   );

-- 앞으로 만들어질 조각뿐 아니라, 아직 안 끝난 기존 조각의 offer_deadline도 비운다.
-- (다음 cron에서 다시 selecting으로 끌려가는 걸 막는다)
UPDATE puzzles
   SET offer_deadline = NULL
 WHERE is_recruiting_party = true
   AND offer_deadline IS NOT NULL
   AND status IN ('open', 'selecting');
