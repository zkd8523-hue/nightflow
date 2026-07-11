-- ============================================================================
-- Migration 457: 첫 매치 성사 전 깃발 총 예산 상한 300만원
-- 날짜: 2026-07-12
-- 설명:
--   문제: 신규/무거래 유저가 비현실적으로 큰 금액(예: 이태원 3명 1800만원)의 깃발을
--         무검증으로 올릴 수 있었다. Model B라 실제 돈을 걸지 않아(스킨인더게임 0)
--         허위/허세 깃발이 홈 상단에 노출되면 기준선 오염 + MD 공급측 신뢰 손상.
--   해결: "첫 매치 성사 이력이 없는" 유저의 깃발은 총 예산 300만원까지만 등록 허용.
--         (매치 성사 1건 이상이면 상한 해제.) 초과 시도 시 고객 문의로 즉시 해제 안내.
--   범위: 깃발(is_recruiting_party=false)만. 조각(모집)은 영향 없음.
--   매치 성사 판정: puzzles.status IN ('accepted','matched')
--     - accepted = MD 오퍼 실제 수락(역경매 매치), matched = 대표자 수동 마감.
--       코드베이스가 이미 둘 다 "매치된 깃발"로 취급(249_get_recent_matched_puzzle 참조).
--   기존 enforce_daily_share_limit() 함수(443)의 ELSE(깃발) 분기에 조건만 추가.
--   트리거 재생성 불필요(함수 본문만 CREATE OR REPLACE).
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

    -- 첫 매치 성사 전 총 예산 상한 300만원 (초과 시 고객 문의로 즉시 해제 안내).
    -- 300만원(3,000,000)은 포함(허용), 초과분(3,000,001~)만 차단.
    IF NEW.total_budget > 3000000
       AND NOT EXISTS (
         SELECT 1 FROM puzzles p
         WHERE p.leader_id = NEW.leader_id
           AND p.status IN ('accepted', 'matched')
       )
    THEN
      RAISE EXCEPTION '첫 매치 성사 전에는 총 예산 300만원까지 등록할 수 있어요. 더 큰 금액은 고객 문의로 요청해주세요.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거는 353/365/443에서 이미 puzzles BEFORE INSERT로 생성됨 → 재생성 불필요.
-- (혹시 없을 경우 대비 idempotent 재생성)
DROP TRIGGER IF EXISTS enforce_daily_share_limit_trg ON puzzles;
CREATE TRIGGER enforce_daily_share_limit_trg
  BEFORE INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION enforce_daily_share_limit();
