-- ============================================================================
-- Migration 366: MD 직통 조각 (puzzles 기반, 무료)
-- 날짜: 2026-07-05
-- 설명:
--   MD가 유저 조각과 같은 puzzles 피드에 직접 조각을 올림(host_is_md).
--   옛 MD 조각 폼(AuctionForm share모드)의 데이터를 담기 위해 컬럼 추가:
--     host_is_md, club_id, includes(주류·구성), table_info(테이블 정보)
--   등록 무료 (크레딧 과금 없음). 유저 입장도 무료.
--   등록 제한 분기:
--     · MD 직통(host_is_md): 같은 클럽·같은 event_date 1개 (총 무제한 — 공급 확보)
--     · 유저 조각: 기존 365 규칙 (같은 event_date 1개 + 총 2개)
-- ============================================================================

-- 1) 컬럼 추가
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS host_is_md BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS includes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS table_info TEXT;

CREATE INDEX IF NOT EXISTS idx_puzzles_host_md ON puzzles(host_is_md) WHERE host_is_md = true;

-- 2) 등록 제한 트리거 재정의 (365 본문 + host_is_md 분기)
CREATE OR REPLACE FUNCTION enforce_daily_share_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_recruiting_party THEN
    IF NEW.host_is_md THEN
      -- MD 직통: 같은 클럽·같은 날 1개만 (총 개수 제한 없음)
      IF NEW.club_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM puzzles p
        WHERE p.leader_id = NEW.leader_id
          AND p.is_recruiting_party = true
          AND p.host_is_md = true
          AND p.club_id = NEW.club_id
          AND p.status <> 'cancelled'
          AND p.leader_hidden_at IS NULL
          AND p.event_date = NEW.event_date
      ) THEN
        RAISE EXCEPTION '같은 클럽·같은 날짜에는 조각을 하나만 올릴 수 있어요';
      END IF;
    ELSE
      -- 유저 조각: 같은 날 1개 + 활성 총 2개 (365 규칙)
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
        RAISE EXCEPTION '조각은 최대 2개까지만 올릴 수 있어요';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거는 353에서 이미 puzzles BEFORE INSERT로 존재 → 함수만 교체됨.
