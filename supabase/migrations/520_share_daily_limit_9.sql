-- ============================================================================
-- Migration 520: 같은 클럽·같은 날 조각 상한 6 → 9 (템플릿 상한과 일치)
-- 날짜: 2026-08-05
-- 배경:
--   템플릿 보관 상한은 513에서 9로 올렸는데, 발행 상한(enforce_daily_share_limit)은
--   6으로 남아 있었다. 그래서 템플릿을 9개 켜면 3개는 매번 실패하고
--   "최대 6개까지만" 토스트만 반복됐다.
--
--   피드 도배 걱정 때문에 6으로 잡았던 건데, 이제 홈·목록 모두 클럽 단위로 묶어
--   보여주므로(ClubDirectCard) 9개여도 카드는 1장이다. 상한을 맞춘다.
--
--   한 MD가 가질 수 있는 템플릿이 9개이므로, 자동 발행으로 만들어질 수 있는
--   같은 클럽·같은 날 조각도 자연히 9개가 최대다.
-- ============================================================================

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

        -- 같은 클럽·같은 날 최대 9개 (템플릿 보관 상한과 동일 — 513/520)
        IF (
          SELECT COUNT(*) FROM puzzles p
          WHERE p.leader_id = NEW.leader_id
            AND p.is_recruiting_party = true
            AND p.host_is_md = true
            AND p.club_id = NEW.club_id
            AND p.status <> 'cancelled'
            AND p.leader_hidden_at IS NULL
            AND p.event_date = NEW.event_date
        ) >= 9 THEN
          RAISE EXCEPTION '같은 클럽·같은 날짜에는 조각을 최대 9개까지만 올릴 수 있어요';
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
