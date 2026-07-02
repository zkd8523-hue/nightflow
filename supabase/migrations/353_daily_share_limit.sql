-- ============================================================================
-- Migration 353: 조각(파티원 모집)은 하루에 하나만 등록
-- 날짜: 2026-07-02
-- 설명:
--   조각(is_recruiting_party=true)은 방장 1명당 하루(KST) 1개만 생성 가능.
--   취소(cancelled)·삭제(leader_hidden)된 건 제외 → 그 경우 다시 올릴 수 있음.
--   깃발(is_recruiting_party=false)에는 영향 없음.
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_daily_share_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_recruiting_party THEN
    IF EXISTS (
      SELECT 1 FROM puzzles p
      WHERE p.leader_id = NEW.leader_id
        AND p.is_recruiting_party = true
        AND p.status <> 'cancelled'
        AND p.leader_hidden_at IS NULL
        AND (p.created_at AT TIME ZONE 'Asia/Seoul')::date
            = (now() AT TIME ZONE 'Asia/Seoul')::date
    ) THEN
      RAISE EXCEPTION '조각은 하루에 하나만 올릴 수 있어요';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_daily_share_limit_trg ON puzzles;
CREATE TRIGGER enforce_daily_share_limit_trg
  BEFORE INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION enforce_daily_share_limit();
