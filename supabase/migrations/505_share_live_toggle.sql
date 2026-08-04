-- ============================================================================
-- Migration 505: 상시 조각 On/Off (템플릿 상시화 + D-7 자동 발행)
-- 날짜: 2026-08-05
-- 배경:
--   MD는 조각을 올릴 때마다 폼을 처음부터 채워야 하고, 올린 조각은 방문일
--   익일 새벽 4시에 사라진다(expires_at). 매일 재등록해야 하고 하루 빼먹으면
--   그날 공급이 0이 된다.
--
--   auction_templates(이미 조각 필드 보유)에 On/Off + 운영 요일 + 종료일을 추가해,
--   MD가 "템플릿 켜두기"만 하면 시스템이 매주 월 18:05에 그 주 발행 대상 요일 전체를
--   미리 만들고, 매일 06:10에 보강한다(D-7 주간 배치). 실제 발행물은 여전히
--   puzzles의 날짜별 row — 정원/선착순/단체채팅 로직은 무변경.
--
--   부수적으로 "클럽 조각 운영권 — 클럽당 MD 1명"을 강제한다. 실제 MD 홍보글은
--   같은 클럽·같은 밤에 등급을 5~6개 동시에 내걸므로(GOOD/VIP/VVIP/SVIP/GOD),
--   enforce_daily_share_limit의 "같은 클럽·같은 날 1개" 제한을 6개로 완화하되,
--   그 6개가 전부 "한 MD" 소유이도록 club_share_slots로 배타적 운영권을 건다.
--
-- 참조:
--   366_md_direct_share.sql (enforce_daily_share_limit 원본, host_is_md 도입)
--   299_share_slots.sql (v1 weekly_share_slots — 클럽×주=MD 1명 선점 개념 참고)
--   302_share_options.sql (v1 옵션 6개 제한 — "자리 등급 5 + 여유 1" 근거)
--   305_generate_share_listings_cron.sql (v1 cron 스케줄 — 월 18:05/매일 06:10 재사용)
--   src/lib/utils/puzzleDeadline.ts (마감 시각 규칙 — 조각: 오퍼마감 익일 3시/만료 익일 4시,
--     변경 시 이 파일의 offer_deadline/expires_at 계산과 반드시 동기화)
--
-- 하지 않는 것 (의도적 축소 — 별도 후속 작업):
--   · share_options/share_weekday_plan/weekly_share_slots 재활성화 안 함
--   · 전날 16시 "오늘 쉬기" 알림 cron (paused_dates는 MD 대시보드 UI에서 수동으로만 채움)
--   · empty_streak/기간종료 자동 OFF 시 인앱 알림 발송 (is_live=false 전환 자체는 동작)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) auction_templates 확장
-- ----------------------------------------------------------------------------
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS live_dows TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS live_until DATE;
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS paused_dates DATE[] NOT NULL DEFAULT '{}';
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS published_dates DATE[] NOT NULL DEFAULT '{}';
ALTER TABLE auction_templates ADD COLUMN IF NOT EXISTS empty_streak INTEGER NOT NULL DEFAULT 0;

-- ON이면 요일·종료일이 반드시 있어야 하고, 종료일은 켜는 시점 기준 최대 4주(28일).
-- "4주"는 우선 테스트값 — 켜놓고 잊은 템플릿이 계속 발행되는 걸 막는 장치.
ALTER TABLE auction_templates DROP CONSTRAINT IF EXISTS chk_auction_templates_live;
ALTER TABLE auction_templates ADD CONSTRAINT chk_auction_templates_live
  CHECK (
    is_live = false
    OR (
      live_until IS NOT NULL
      AND COALESCE(array_length(live_dows, 1), 0) > 0
      AND live_until <= CURRENT_DATE + INTERVAL '28 days'
    )
  );

COMMENT ON COLUMN auction_templates.is_live IS '상시 조각 On/Off. ON이면 publish_live_shares()가 매주 발행 대상으로 순회';
COMMENT ON COLUMN auction_templates.live_dows IS '운영 요일 — mon/tue/wed/thu/fri/sat/sun 소문자 3글자';
COMMENT ON COLUMN auction_templates.live_until IS '상시 운영 종료일. NULL이면 is_live=true 불가(CHECK)';
COMMENT ON COLUMN auction_templates.paused_dates IS '특정 날짜만 발행 건너뜀("오늘 하루만 쉼")';
COMMENT ON COLUMN auction_templates.published_dates IS '이미 발행한 날짜 누적(멱등 가드). D-7 일괄 발행이라 단일 날짜로는 부족';
COMMENT ON COLUMN auction_templates.empty_streak IS '연속 참여 0 발행 횟수. 3 도달 시 sweep_live_shares()가 자동 OFF';

-- ----------------------------------------------------------------------------
-- 2) 템플릿 보관 개수 6개 제한 (INSERT 시점에만 — 기존 9개 보유 MD 데이터 보존)
--    065_auction_templates.sql 패턴 재사용. 081에서 DROP됐다가 172 재생성 시
--    복원되지 않아 현재 무제한 상태 → 이번에 6개로 새로 건다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_auction_template_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.listing_type = 'share' AND (
    SELECT COUNT(*) FROM auction_templates
    WHERE md_id = NEW.md_id AND listing_type = 'share'
  ) >= 6 THEN
    RAISE EXCEPTION '템플릿은 최대 6개까지 저장할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_auction_template_limit ON auction_templates;
CREATE TRIGGER enforce_auction_template_limit
  BEFORE INSERT ON auction_templates
  FOR EACH ROW EXECUTE FUNCTION check_auction_template_limit();

-- ----------------------------------------------------------------------------
-- 3) puzzles.source_template_id — 자동 발행분이 어느 템플릿에서 왔는지 역참조.
--    MD 대시보드 "자동" 배지, "그날 것만 취소"(paused_dates 반영), sweep의
--    empty_streak 집계 전부 이 컬럼으로 매칭한다.
-- ----------------------------------------------------------------------------
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS source_template_id UUID
  REFERENCES auction_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_puzzles_source_template ON puzzles(source_template_id)
  WHERE source_template_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4) club_share_slots — 클럽 조각 운영권 (클럽당 MD 1명, 상시·1회성 공통 적용)
--    선착순 자동 선점. v1 weekly_share_slots(299)의 "클럽×주=MD 1명" 개념을
--    "운영 기간 단위"로 바꾼 것.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS club_share_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  md_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_share_slots_md ON club_share_slots(md_id);
-- 클럽당 "활성" 슬롯은 released_at IS NULL인 행 최대 1개.
-- expires_at은 now()가 IMMUTABLE이 아니라 인덱스 조건에 못 넣으므로,
-- 만료 판정은 claim_or_check_club_slot()에서 조회 시점에 released_at으로 정리한다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_share_slots_one_active
  ON club_share_slots(club_id) WHERE released_at IS NULL;

ALTER TABLE club_share_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_share_slots_select_all" ON club_share_slots;
CREATE POLICY "club_share_slots_select_all" ON club_share_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS "club_share_slots_admin_all" ON club_share_slots;
CREATE POLICY "club_share_slots_admin_all" ON club_share_slots FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE club_share_slots IS
  '클럽 조각 운영권. 클럽당 released_at IS NULL 행 1개 = 현재 운영 중인 MD. claim_or_check_club_slot()으로만 변경.';

-- 슬롯 선점/확인/자동 만료 정리를 한 함수로 처리.
-- 반환 true = 이 MD가 그 클럽에 조각을 올려도 됨(신규 선점 또는 본인 슬롯 갱신).
-- 반환 false = 다른 MD가 이미 운영 중.
CREATE OR REPLACE FUNCTION claim_or_check_club_slot(
  p_club_id UUID,
  p_md_id UUID,
  p_expires_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot club_share_slots%ROWTYPE;
BEGIN
  -- 만료된 활성 슬롯 정리 (조회 시점 지연 만료)
  UPDATE club_share_slots
  SET released_at = now()
  WHERE club_id = p_club_id AND released_at IS NULL AND expires_at <= now();

  SELECT * INTO v_slot FROM club_share_slots
  WHERE club_id = p_club_id AND released_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    -- 공석 → 선착순 선점
    INSERT INTO club_share_slots (club_id, md_id, expires_at)
    VALUES (p_club_id, p_md_id, p_expires_at);
    RETURN true;
  END IF;

  IF v_slot.md_id = p_md_id THEN
    -- 본인 슬롯 → 만료일 갱신(연장)
    UPDATE club_share_slots
    SET expires_at = GREATEST(expires_at, p_expires_at)
    WHERE id = v_slot.id;
    RETURN true;
  END IF;

  RETURN false; -- 다른 MD가 운영 중
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) enforce_daily_share_limit 완화 — MD 직통 분기: 클럽당 하루 1개 → 6개
--    + club_share_slots 운영권 강제. 유저 조각 분기(같은 날 1개 + 총 2개)는 무변경.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_daily_share_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_recruiting_party THEN
    IF NEW.host_is_md THEN
      IF NEW.club_id IS NOT NULL THEN
        -- 운영권 확인/선점 (없으면 이 MD가 자동 선점 — 선착순)
        IF NOT claim_or_check_club_slot(NEW.club_id, NEW.leader_id, (NEW.event_date + INTERVAL '2 days')) THEN
          RAISE EXCEPTION '이 클럽은 다른 파트너가 운영 중이에요';
        END IF;

        -- 같은 클럽·같은 날 최대 6개(자리 등급 5 + 여유 1, 302_share_options.sql 근거)
        IF (
          SELECT COUNT(*) FROM puzzles p
          WHERE p.leader_id = NEW.leader_id
            AND p.is_recruiting_party = true
            AND p.host_is_md = true
            AND p.club_id = NEW.club_id
            AND p.status <> 'cancelled'
            AND p.leader_hidden_at IS NULL
            AND p.event_date = NEW.event_date
        ) >= 6 THEN
          RAISE EXCEPTION '같은 클럽·같은 날짜에는 조각을 최대 6개까지만 올릴 수 있어요';
        END IF;
      END IF;
    ELSE
      -- 유저 조각: 같은 날 1개 + 활성 총 2개 (365 규칙, 무변경)
      IF EXISTS (
        SELECT 1 FROM puzzles p
        WHERE p.leader_id = NEW.leader_id
          AND p.is_recruiting_party = true
          AND p.host_is_md = false
          AND p.status <> 'cancelled'
          AND p.leader_hidden_at IS NULL
          AND p.event_date = NEW.event_date
      ) THEN
        RAISE EXCEPTION '같은 날짜에는 조각을 하나만 올릴 수 있어요';
      END IF;

      IF (
        SELECT COUNT(*) FROM puzzles p
        WHERE p.leader_id = NEW.leader_id
          AND p.is_recruiting_party = true
          AND p.host_is_md = false
          AND p.status <> 'cancelled'
          AND p.leader_hidden_at IS NULL
      ) >= 2 THEN
        RAISE EXCEPTION '조각은 동시에 최대 2개까지 올릴 수 있어요';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6) publish_live_shares(p_days) — D-7 주간 배치 발행
--    is_live=true 템플릿을 순회하며 오늘부터 p_days일 각각에 대해 발행 여부 판정.
--    puzzles INSERT는 AuctionForm.tsx의 host_is_md INSERT와 동일한 컬럼 세트.
--    offer_deadline/expires_at 규칙 원본: src/lib/utils/puzzleDeadline.ts
--      (조각: 오퍼마감 익일 03:00 KST, 만료 익일 04:00 KST) — 변경 시 양쪽 동기화 필수.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION publish_live_shares(p_days INT DEFAULT 7)
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
  FOR t IN
    SELECT * FROM auction_templates
    WHERE is_live = true AND listing_type = 'share'
  LOOP
    FOR v_offset IN 0..(p_days - 1) LOOP
      v_event_date := v_today + v_offset;

      -- 운영 종료일 지났으면 이 템플릿의 이후 offset도 볼 필요 없음
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
      IF t.club_id IS NULL OR t.total_seats IS NULL OR t.price_per_seat IS NULL THEN
        -- 필수값 결손 템플릿(승계 방어) — 스위치는 UI에서 막지만 DB에서도 한 번 더 막는다.
        CONTINUE;
      END IF;

      SELECT area INTO v_area FROM clubs WHERE id = t.club_id;

      v_offer_deadline := ((v_event_date + 1)::text || ' 03:00:00+09')::timestamptz;
      v_expires_at      := ((v_event_date + 1)::text || ' 04:00:00+09')::timestamptz;

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
        -- 운영권 충돌(다른 MD 운영 중) 또는 6개 상한 도달 → 이 템플릿·이 날짜만 skip,
        -- 다른 템플릿/날짜는 계속 진행. published_dates에 남기지 않아 다음 실행에 재시도된다.
        v_skipped := v_skipped + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_published, v_skipped;
END;
$$;

COMMENT ON FUNCTION publish_live_shares IS
  'D-7 주간 배치 발행. pg_cron이 직접 호출(SECURITY DEFINER). 멱등 — published_dates로 중복 방지.';

-- ----------------------------------------------------------------------------
-- 7) sweep_live_shares() — 자동 OFF 안전장치
--    (a) 운영 기간 종료 → is_live=false
--    (b) 자동발행분이 만료됐는데 참여 0(방장 본인만) → empty_streak+1, 있었으면 0으로 리셋
--    (c) empty_streak 3 도달 → is_live=false
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sweep_live_shares()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  UPDATE auction_templates
  SET is_live = false
  WHERE is_live = true
    AND live_until IS NOT NULL
    AND live_until < (now() AT TIME ZONE 'Asia/Seoul')::date;

  FOR r IN
    SELECT p.id, p.source_template_id, p.current_count
    FROM puzzles p
    WHERE p.source_template_id IS NOT NULL
      AND p.status = 'expired'
      AND p.expires_at >= now() - INTERVAL '25 hours'
      AND p.expires_at < now()
  LOOP
    IF r.current_count <= 1 THEN
      UPDATE auction_templates SET empty_streak = empty_streak + 1 WHERE id = r.source_template_id;
    ELSE
      UPDATE auction_templates SET empty_streak = 0 WHERE id = r.source_template_id;
    END IF;
  END LOOP;

  UPDATE auction_templates SET is_live = false WHERE is_live = true AND empty_streak >= 3;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8) pg_cron — v1 잡 해제 후 신규 스케줄 등록
--    함수를 pg_cron이 직접 호출(SECURITY DEFINER) — 220/305와 달리 Edge
--    Function/net.http_post 불필요.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'generate-share-listings-weekly', 'generate-share-listings-daily',
      'share-live-publish-weekly', 'share-live-publish-daily', 'share-live-sweep-daily'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

-- 매주 월 18:05 KST (09:05 UTC) — 그 주 발행 대상 요일 일괄
SELECT cron.schedule(
  'share-live-publish-weekly',
  '5 9 * * 1',
  $$ SELECT publish_live_shares(7); $$
);

-- 매일 06:10 KST (전날 21:10 UTC) — 주중 신규/변경분 보강 (멱등)
SELECT cron.schedule(
  'share-live-publish-daily',
  '10 21 * * *',
  $$ SELECT publish_live_shares(7); $$
);

-- 매일 06:15 KST (전날 21:15 UTC) — 자동 OFF 안전장치
SELECT cron.schedule(
  'share-live-sweep-daily',
  '15 21 * * *',
  $$ SELECT sweep_live_shares(); $$
);
