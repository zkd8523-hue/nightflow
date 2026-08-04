-- ============================================================================
-- Migration 527: 조각 가격 오버플로 방어 ("integer out of range" 토스트)
-- 날짜: 2026-08-05
-- 배경:
--   puzzles.total_budget이 integer(최대 21억)인데 발행 시 price_per_seat × total_seats로
--   채운다. 테스트로 만든 "인당 123123만원"(12.3억) × 6명 = 73.8억이 컬럼을 넘겨
--   INSERT가 터졌고, 512가 SQLERRM을 그대로 올려주는 바람에 MD 화면에
--   "integer out of range"라는 원문이 그대로 떴다.
--
--   두 겹으로 막는다.
--     1) 발행 함수에서 미리 계산해 넘치면 읽을 수 있는 사유로 skip
--     2) 템플릿 저장 자체를 1인 1천만원으로 제한 (현실 상한 겸 방어)
--        기존 행에 12억짜리 테스트 데이터가 있어 NOT VALID — 새로 넣거나 고칠 때만 적용된다.
--
--   상한을 더 올리려면 puzzles.total_budget을 BIGINT로 바꿔야 한다. 실제 테이블 가격이
--   1인 1천만원을 넘을 일이 없어 여기서 끊는다.
-- ============================================================================

-- 1인 가격 상한 (원). 클라이언트 MAX_PRICE_MAN(1000만원)과 같은 기준.
ALTER TABLE auction_templates
  DROP CONSTRAINT IF EXISTS chk_auction_templates_price;
ALTER TABLE auction_templates
  ADD CONSTRAINT chk_auction_templates_price
  CHECK (price_per_seat IS NULL OR price_per_seat <= 10000000) NOT VALID;

CREATE OR REPLACE FUNCTION publish_share_template(p_template_id UUID, p_days INT DEFAULT 7)
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
  v_first_error TEXT := NULL;
BEGIN
  SELECT * INTO t FROM auction_templates WHERE id = p_template_id;
  IF NOT FOUND OR NOT t.is_live OR t.listing_type <> 'share' THEN
    RETURN QUERY SELECT 0, 0, NULL::TEXT;
    RETURN;
  END IF;

  IF t.club_id IS NULL OR t.total_seats IS NULL OR t.price_per_seat IS NULL THEN
    RETURN QUERY SELECT 0, 1, '클럽·인원·가격을 먼저 채워주세요'::TEXT;
    RETURN;
  END IF;

  -- total_budget(integer) 오버플로 사전 차단 — 터진 뒤 SQLERRM을 보여주면
  -- MD에겐 "integer out of range"라는 알 수 없는 문장만 남는다 (Migration 527)
  IF t.price_per_seat::BIGINT * t.total_seats > 2000000000 THEN
    RETURN QUERY SELECT 0, 1, '1인 가격이 너무 커요 — 세팅 수정에서 확인해주세요'::TEXT;
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
      -- 운영권 충돌 / 같은 클럽·날짜 상한 → 이 날짜만 skip.
      -- 첫 사유는 그대로 올려 "왜 안 올라가지"를 추적할 수 있게 한다(512).
      v_skipped := v_skipped + 1;
      IF v_first_error IS NULL THEN v_first_error := SQLERRM; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped, v_first_error;
END;
$$;

COMMENT ON FUNCTION publish_share_template(UUID, INT) IS
  '템플릿 1개를 p_days일치 발행. 가격 오버플로는 사전 차단하고 읽을 수 있는 사유를 반환(Migration 527).';
