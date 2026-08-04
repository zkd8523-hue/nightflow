-- ============================================================================
-- Migration 507: 상시 조각 토글 즉시 발행 (505 후속)
-- 날짜: 2026-08-05
-- 배경:
--   505의 발행은 pg_cron(월 18:05 / 매일 06:10)에서만 일어난다. 그래서 MD가
--   오늘 요일을 켜도 다음 cron까지 아무것도 생성되지 않고, 오늘 밤 자리는 통째로 날아간다.
--   ("발행 예정 — 아직 생성 전이에요" 상태로 방치)
--
--   토글을 켜는 순간 본인 템플릿만 즉시 발행할 수 있도록 전용 함수를 추가한다.
--   publish_live_shares()는 전체 MD를 순회하므로 클라이언트가 직접 호출하면 안 된다
--   (SECURITY DEFINER + 소유자 필터 없음 → 아무 유저나 전역 발행을 트리거할 수 있음).
--
-- 구조:
--   publish_share_template(p_template_id, p_days)  ← 템플릿 1개 발행 (내부 공용)
--   publish_live_shares(p_days)                    ← 전체 순회 (cron 전용, 위 함수 재사용)
--   publish_my_share_template(p_template_id)       ← 클라이언트용. auth.uid() 소유 확인
--
-- 마감 시각 규칙 원본: src/lib/utils/puzzleDeadline.ts (조각 = 오퍼마감 익일 03:00 KST,
--   만료 익일 04:00 KST) — 변경 시 반드시 양쪽 동기화.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 템플릿 1개 발행 — 505 publish_live_shares() 본문에서 순회 대상만 분리
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

  -- 필수값 결손(승계 방어) — UI에서도 막지만 DB에서 한 번 더
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
        0, 0, t.total_seats, 1,
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
      -- 운영권 충돌(다른 파트너 운영 중) 또는 클럽·날짜 6개 상한 → 이 날짜만 skip.
      -- published_dates에 남기지 않으므로 다음 실행에서 재시도된다.
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) 전체 순회 (cron 전용) — 위 함수 재사용으로 재정의
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3) 클라이언트용 — 본인 템플릿만. 토글 ON 직후 호출해 즉시 발행.
-- ----------------------------------------------------------------------------
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
    'skipped', COALESCE(v_res.skipped_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION publish_my_share_template(UUID, INT) TO authenticated;
