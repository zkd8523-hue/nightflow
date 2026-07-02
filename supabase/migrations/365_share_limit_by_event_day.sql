-- ============================================================================
-- Migration 365: 조각 등록 제한 변경 — "생성일 하루 1개" → "같은 event_date 1개 + 총 2개"
-- 날짜: 2026-07-02
-- 설명:
--   기존(353)은 "생성일(KST) 기준 하루 1개"였으나, 실제 의도는:
--     1) 같은 행사일(event_date)에는 활성 조각 1개만
--     2) 활성 조각은 방장 1명당 최대 2개
--   활성 = status <> 'cancelled' AND leader_hidden_at IS NULL (취소·삭제 건은 제외 → 재등록 가능)
--   깃발(is_recruiting_party=false)에는 영향 없음.
--   함수명(enforce_daily_share_limit)·트리거명은 유지(트리거 재생성 불필요), 본문만 교체.
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_daily_share_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_recruiting_party THEN
    -- 1) 같은 행사일에 이미 활성 조각이 있으면 차단
    IF EXISTS (
      SELECT 1 FROM puzzles p
      WHERE p.leader_id = NEW.leader_id
        AND p.is_recruiting_party = true
        AND p.status <> 'cancelled'
        AND p.leader_hidden_at IS NULL
        AND p.event_date = NEW.event_date
    ) THEN
      RAISE EXCEPTION '같은 날짜에는 조각을 하나만 올릴 수 있어요';
    END IF;

    -- 2) 활성 조각 총 2개 제한
    IF (
      SELECT COUNT(*) FROM puzzles p
      WHERE p.leader_id = NEW.leader_id
        AND p.is_recruiting_party = true
        AND p.status <> 'cancelled'
        AND p.leader_hidden_at IS NULL
    ) >= 2 THEN
      RAISE EXCEPTION '조각은 최대 2개까지만 올릴 수 있어요';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거는 353에서 이미 puzzles BEFORE INSERT로 생성됨 → 재생성 불필요.
-- (혹시 없을 경우 대비 idempotent 재생성)
DROP TRIGGER IF EXISTS enforce_daily_share_limit_trg ON puzzles;
CREATE TRIGGER enforce_daily_share_limit_trg
  BEFORE INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION enforce_daily_share_limit();
