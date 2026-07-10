-- ============================================================================
-- Migration 443: 깃발 등록 제한 추가 — "같은 event_date에 활성 깃발 1개"
-- 날짜: 2026-07-10
-- 설명:
--   기존 365는 조각(is_recruiting_party=true)에만 "같은 행사일 1개 + 총 2개" 제한을 걸었고,
--   깃발(is_recruiting_party=false)에는 개수 제한이 없었다.
--   문제: 한 유저가 강남/홍대에 각각 깃발을 올려도 실제 매치되는 건 결국 1개.
--         MD가 여러 지역 깃발에 오퍼를 넣지만 성사는 1건뿐 → MD 피로도↑, 성사율↓.
--   해결: 같은 행사일(event_date)에는 활성 깃발도 유저당 1개만 허용(지역 무관).
--   활성 = status <> 'cancelled' AND leader_hidden_at IS NULL (취소·삭제 건은 재등록 가능).
--   같은 함수(enforce_daily_share_limit)에 else 분기만 추가 → 트리거 재생성 불필요.
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_daily_share_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_recruiting_party THEN
    -- ── 조각(파티원 모집) ──────────────────────────────────────────────
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
  ELSE
    -- ── 깃발(인원 확정) ────────────────────────────────────────────────
    -- 같은 행사일에 이미 활성 깃발이 있으면 차단 (지역 무관).
    -- 실제 매치는 결국 1건 → 여러 지역 중복 등록 방지로 MD 피로도·성사율 보호.
    IF EXISTS (
      SELECT 1 FROM puzzles p
      WHERE p.leader_id = NEW.leader_id
        AND p.is_recruiting_party = false
        AND p.status <> 'cancelled'
        AND p.leader_hidden_at IS NULL
        AND p.event_date = NEW.event_date
    ) THEN
      RAISE EXCEPTION '같은 날짜에는 깃발을 하나만 올릴 수 있어요';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거는 353/365에서 이미 puzzles BEFORE INSERT로 생성됨 → 재생성 불필요.
-- (혹시 없을 경우 대비 idempotent 재생성)
DROP TRIGGER IF EXISTS enforce_daily_share_limit_trg ON puzzles;
CREATE TRIGGER enforce_daily_share_limit_trg
  BEFORE INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION enforce_daily_share_limit();
