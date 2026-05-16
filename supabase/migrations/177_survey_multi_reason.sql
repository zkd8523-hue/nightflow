-- ============================================================================
-- Migration 177: 깃발 매치실패 설문 — 사유 복수선택 지원
-- 배경: 175가 단일 reason_category만 허용. 실제 사용자는 두 가지 이상 사유가
--       겹치는 경우가 흔함(예: "약속 변경 + 오퍼 별로"). 배열 컬럼으로 전환.
-- ============================================================================

-- 1) 새 배열 컬럼 추가
ALTER TABLE puzzle_cancellation_surveys
  ADD COLUMN IF NOT EXISTS reason_categories puzzle_cancel_reason[];

-- 2) 기존 단일 값 → 배열로 백필 (reason_category 컬럼이 남아있을 때만)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'puzzle_cancellation_surveys'
      AND column_name = 'reason_category'
  ) THEN
    EXECUTE 'UPDATE puzzle_cancellation_surveys
             SET reason_categories = ARRAY[reason_category]
             WHERE reason_categories IS NULL';
  END IF;
END $$;

-- 3) NULL 잔존 행은 'no_answer'로 채움 (백필 실패한 케이스 보호)
UPDATE puzzle_cancellation_surveys
  SET reason_categories = ARRAY['no_answer'::puzzle_cancel_reason]
  WHERE reason_categories IS NULL;

ALTER TABLE puzzle_cancellation_surveys
  ALTER COLUMN reason_categories SET NOT NULL;

ALTER TABLE puzzle_cancellation_surveys
  DROP CONSTRAINT IF EXISTS reason_categories_min_one;

ALTER TABLE puzzle_cancellation_surveys
  ADD CONSTRAINT reason_categories_min_one
    CHECK (array_length(reason_categories, 1) >= 1);

-- 4) 기존 단일 컬럼 제거 (CASCADE: 의존 인덱스 함께 정리)
ALTER TABLE puzzle_cancellation_surveys DROP COLUMN IF EXISTS reason_category;

-- 5) GIN 인덱스 (contains 쿼리용)
DROP INDEX IF EXISTS idx_puzzle_surveys_category;
CREATE INDEX IF NOT EXISTS idx_puzzle_surveys_categories
  ON puzzle_cancellation_surveys USING GIN (reason_categories);

-- ============================================================================
-- 6) submit_cancellation_survey RPC — 배열 수신으로 교체
-- ============================================================================
-- 기존 단일 시그니처 제거 (인자 타입 변경이라 명시적 DROP 필요)
DROP FUNCTION IF EXISTS submit_cancellation_survey(UUID, puzzle_cancel_reason, TEXT);

CREATE OR REPLACE FUNCTION submit_cancellation_survey(
  p_puzzle_id         UUID,
  p_reason_categories puzzle_cancel_reason[],
  p_reason_text       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trigger puzzle_survey_trigger;
BEGIN
  -- 본인 깃발인지 검증
  SELECT
    CASE
      WHEN status = 'cancelled' THEN 'self_cancelled'::puzzle_survey_trigger
      ELSE 'selecting_expired'::puzzle_survey_trigger
    END
  INTO v_trigger
  FROM puzzles
  WHERE id = p_puzzle_id AND leader_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 깃발에 대한 설문 권한이 없습니다';
  END IF;

  -- 최소 1개 필요
  IF p_reason_categories IS NULL OR array_length(p_reason_categories, 1) IS NULL THEN
    RAISE EXCEPTION '사유를 하나 이상 선택해주세요';
  END IF;

  -- 'other' 포함 시 자유서술 필수
  IF 'other' = ANY(p_reason_categories) AND (p_reason_text IS NULL OR trim(p_reason_text) = '') THEN
    RAISE EXCEPTION '기타 선택 시 내용을 입력해주세요';
  END IF;

  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_categories, reason_text)
  VALUES
    (p_puzzle_id, auth.uid(), v_trigger, p_reason_categories, p_reason_text);
END;
$$;

-- ============================================================================
-- 7) admin_puzzle_cancellation_stats — UNNEST 기반 집계로 교체
--    비율은 "응답자 수 대비 해당 사유 선택 비율" (복수선택이라 합계 100% 초과 가능)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_puzzle_cancellation_stats(
  p_from    DATE DEFAULT (now() - INTERVAL '30 days')::DATE,
  p_to      DATE DEFAULT now()::DATE,
  p_trigger TEXT DEFAULT NULL
)
RETURNS TABLE (
  reason_category TEXT,
  label           TEXT,
  cnt             BIGINT,
  ratio           NUMERIC
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH exploded AS (
    SELECT UNNEST(reason_categories) AS reason_category
    FROM puzzle_cancellation_surveys
    WHERE responded_at::DATE BETWEEN p_from AND p_to
      AND (p_trigger IS NULL OR trigger_type::TEXT = p_trigger)
  ),
  total_responses AS (
    SELECT COUNT(*) AS total
    FROM puzzle_cancellation_surveys
    WHERE responded_at::DATE BETWEEN p_from AND p_to
      AND (p_trigger IS NULL OR trigger_type::TEXT = p_trigger)
  ),
  grouped AS (
    SELECT reason_category::TEXT, COUNT(*) AS cnt
    FROM exploded
    GROUP BY reason_category
  )
  SELECT
    g.reason_category,
    CASE g.reason_category
      WHEN 'schedule_change'    THEN '약속/일정이 바뀌었어요'
      WHEN 'no_preferred_venue' THEN '원하는 장소가 없어요'
      WHEN 'weak_offers'        THEN '오퍼가 별로였어요'
      WHEN 'mind_change'        THEN '단순변심'
      WHEN 'forgot_about_it'    THEN '잊어버렸어요'
      WHEN 'other'              THEN '기타'
      WHEN 'no_answer'          THEN '잘 모르겠어요'
    END AS label,
    g.cnt,
    CASE WHEN t.total = 0 THEN 0
         ELSE ROUND(g.cnt::NUMERIC / t.total * 100, 1)
    END AS ratio
  FROM grouped g
  CROSS JOIN total_responses t
  ORDER BY g.cnt DESC;
$$;

COMMENT ON FUNCTION submit_cancellation_survey(UUID, puzzle_cancel_reason[], TEXT) IS
  'Migration 177: 사유 복수선택 지원으로 교체.';
COMMENT ON FUNCTION admin_puzzle_cancellation_stats(DATE, DATE, TEXT) IS
  'Migration 177: UNNEST 기반 집계. ratio는 응답자 대비 선택 비율(합계 100% 초과 가능).';
