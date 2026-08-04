-- ============================================================================
-- Migration 514: 조각 운영권을 주 단위 슬롯(weekly_share_slots)으로 통일
-- 날짜: 2026-08-05
-- 배경:
--   505에서 club_share_slots라는 새 테이블로 "클럽당 파트너 1명"을 구현했는데,
--   같은 개념이 이미 weekly_share_slots(299)로 존재한다. 게스트 간판
--   (weekly_hotdeal_slots, 234)과 똑같은 리듬 — 클럽×주 = MD 1명, 매주 월 18시 오픈,
--   다음 월 18시 만료, 다음 주 선점(연장) 가능 — 이고 claim/release/admin 배정 RPC와
--   ShareSlotBoard UI까지 갖춰져 있다.
--
--   운영권 출처가 둘로 갈라지면 "누가 이 클럽 파트너인가"의 답이 화면마다 달라진다.
--   → club_share_slots를 버리고 weekly_share_slots 하나로 통일한다.
--
--   판정 기준: 조각의 event_date가 속한 주(week_start=그 주 월요일)에
--   해당 클럽 슬롯을 이 MD가 갖고 있어야 발행/등록이 통과한다.
--
-- 참조: 299_share_slots.sql(테이블), 431_md_to_partner_wording.sql(claim_share_slot),
--       309_admin_assign_share_slot.sql(admin 배정/회수), 234(week_start_kst 헬퍼)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 슬롯 보유 판정 헬퍼 — event_date가 속한 주 기준
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_share_slot_for_date(
  p_club_id UUID,
  p_md_id UUID,
  p_event_date DATE
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_week_start DATE;
BEGIN
  -- 그 날짜가 속한 주의 월요일 (ISODOW: 1=월 … 7=일)
  v_week_start := p_event_date - (EXTRACT(ISODOW FROM p_event_date)::int - 1);

  RETURN EXISTS (
    SELECT 1 FROM weekly_share_slots
    WHERE club_id = p_club_id
      AND md_id = p_md_id
      AND week_start = v_week_start
  );
END;
$$;

COMMENT ON FUNCTION has_share_slot_for_date IS
  '조각 방문일이 속한 주에 그 클럽 운영권(weekly_share_slots)을 이 MD가 갖고 있는지.';

-- ----------------------------------------------------------------------------
-- 2) 등록 게이트 — club_share_slots 대신 weekly_share_slots를 본다
--    (자동 선점은 하지 않는다. 슬롯은 MD가 명시적으로 잡아야 한다 —
--     게스트 간판과 동일하게 "선점"이 의식적인 행동이어야 분쟁이 안 생긴다.)
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
        IF NOT has_share_slot_for_date(NEW.club_id, NEW.leader_id, NEW.event_date) THEN
          RAISE EXCEPTION '이 주의 클럽 조각 자리를 먼저 선점해주세요';
        END IF;

        -- 같은 클럽·같은 날 최대 6개 (자리 등급 5 + 여유 1, 302 근거)
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
-- 3) 505에서 만든 club_share_slots 정리 — 더 이상 참조되지 않는다
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS claim_or_check_club_slot(UUID, UUID, TIMESTAMPTZ);
DROP TABLE IF EXISTS club_share_slots;

-- ----------------------------------------------------------------------------
-- 4) 화면에서 "이 클럽 지금 누가 운영 중인지"를 한 번에 묻기 위한 조회 함수
--    조각 섹션 진입 시 호출해 미리 안내한다(토글을 눌러 실패로 알게 하지 않는다).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_share_slot_status()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_md UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_kst TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Seoul';
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_week_start DATE;
  v_rows JSON;
BEGIN
  IF v_md IS NULL THEN
    RETURN json_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  -- 이번 주 월요일. 단 월요일 18시 이전이면 아직 지난 주 슬롯이 유효(게스트 간판과 동일).
  v_week_start := v_today - (EXTRACT(ISODOW FROM v_today)::int - 1);
  IF EXTRACT(ISODOW FROM v_today)::int = 1 AND EXTRACT(HOUR FROM v_kst) < 18 THEN
    v_week_start := v_week_start - 7;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      c.id            AS club_id,
      c.name          AS club_name,
      s.md_id         AS holder_id,
      u.display_name  AS holder_name,
      (s.md_id = v_md) AS is_mine,
      s.week_start,
      s.expires_at
    FROM club_partners cp
    JOIN clubs c ON c.id = cp.club_id
    LEFT JOIN weekly_share_slots s
      ON s.club_id = c.id AND s.week_start = v_week_start
    LEFT JOIN users u ON u.id = s.md_id
    WHERE cp.md_id = v_md
  ) x;

  RETURN json_build_object('success', true, 'week_start', v_week_start, 'clubs', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_share_slot_status() TO authenticated;

COMMENT ON FUNCTION get_my_share_slot_status IS
  '내 소속 클럽별 이번 주 조각 운영권 보유자. 조각 섹션 진입 시 안내용.';
