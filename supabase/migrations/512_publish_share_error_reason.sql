-- ============================================================================
-- Migration 512: 발행 실패 사유를 그대로 돌려준다 (507 후속)
-- 날짜: 2026-08-05
-- 배경:
--   publish_share_template은 INSERT 예외를 EXCEPTION WHEN OTHERS로 삼키고
--   skipped 카운트만 올렸다. 그래서 화면에는 늘 "다른 파트너가 운영 중이거나
--   그날 자리가 꽉 찼어요"만 떴고, 실제 원인(예: check_share_min_budget 위반)은
--   어디에도 남지 않아 디버깅에 오래 걸렸다.
--
--   → 첫 실패의 SQLERRM을 반환값에 실어 보낸다. 화면은 이 문구를 그대로 보여준다.
-- ============================================================================

-- 반환 타입(OUT 파라미터 구성)이 바뀌므로 CREATE OR REPLACE로는 교체가 안 된다.
-- publish_live_shares가 이 함수를 참조하지만 함수 간 의존성은 DROP을 막지 않는다
-- (본문은 실행 시점에 해석됨) — 아래에서 두 호출부를 모두 재정의한다.
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
  v_offer_deadline TIMESTAMPTZ;
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
        0, 0, t.total_seats, 0,
        t.price_per_seat, t.price_per_seat * t.total_seats, t.includes, t.table_type,
        t.name, t.md_comment,
        v_offer_deadline, v_expires_at, t.id
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
