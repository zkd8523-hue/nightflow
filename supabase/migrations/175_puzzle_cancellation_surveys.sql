-- ============================================================================
-- Migration 175: 깃발 취소·미수락 사유 설문
-- 트리거: (1) 유저 self-cancel, (2) selecting 단계 만료
-- 다음 접속 시 시트 팝업 → 사유 수집 → admin에서 집계 조회
-- ============================================================================

-- 사유 ENUM
CREATE TYPE puzzle_cancel_reason AS ENUM (
  'schedule_change',     -- 약속/일정이 바뀌어요
  'no_preferred_venue',  -- 원하는 장소가 없어요
  'weak_offers',         -- 오퍼가 별로였어요
  'mind_change',         -- 그냥 변심했어요
  'forgot_about_it',     -- 올려놓고 잊어버렸어요
  'other',               -- 기타 (자유서술)
  'no_answer'            -- 이유 모름 / 스킵 (5초 후 건너뛰기)
);

-- 트리거 유형 ENUM
CREATE TYPE puzzle_survey_trigger AS ENUM (
  'self_cancelled',    -- 유저가 직접 취소 (cancel_puzzle RPC)
  'selecting_expired'  -- selecting 단계 만료 (offer_deadline 경과 후 expired)
);

-- 설문 응답 테이블
CREATE TABLE puzzle_cancellation_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id       UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type    puzzle_survey_trigger NOT NULL,
  reason_category puzzle_cancel_reason NOT NULL,
  reason_text     TEXT CHECK (char_length(reason_text) <= 300),
  responded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, user_id)
);

CREATE INDEX idx_puzzle_surveys_user     ON puzzle_cancellation_surveys(user_id);
CREATE INDEX idx_puzzle_surveys_category ON puzzle_cancellation_surveys(reason_category, responded_at DESC);
CREATE INDEX idx_puzzle_surveys_trigger  ON puzzle_cancellation_surveys(trigger_type, responded_at DESC);

ALTER TABLE puzzle_cancellation_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sees_own_surveys"
  ON puzzle_cancellation_surveys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_inserts_own_survey"
  ON puzzle_cancellation_surveys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_reads_all_surveys"
  ON puzzle_cancellation_surveys FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================================================
-- RPC 1: 응답 대기 중인 설문 조회 (유저용)
-- 조건: 본인 깃발 중 survey 미응답 + 14일 이내
--   - self_cancelled: status='cancelled' AND cancelled_reason IS NULL (admin 취소 제외)
--   - selecting_expired: status='expired' AND offer_deadline IS NOT NULL
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pending_cancellation_survey()
RETURNS TABLE (
  puzzle_id    UUID,
  trigger_type puzzle_survey_trigger,
  club_label   TEXT,
  event_date   DATE,
  occurred_at  TIMESTAMPTZ
)
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT
    p.id,
    CASE
      WHEN p.status = 'cancelled' THEN 'self_cancelled'::puzzle_survey_trigger
      ELSE 'selecting_expired'::puzzle_survey_trigger
    END AS trigger_type,
    COALESCE(c.name, '미지정')  AS club_label,
    p.event_date::DATE          AS event_date,
    COALESCE(p.cancelled_at, p.expires_at) AS occurred_at
  FROM puzzles p
  LEFT JOIN clubs c ON c.id = (
    SELECT club_id FROM puzzle_offers
    WHERE puzzle_id = p.id AND status = 'accepted'
    LIMIT 1
  )
  LEFT JOIN puzzle_cancellation_surveys s
    ON s.puzzle_id = p.id AND s.user_id = auth.uid()
  WHERE p.leader_id = auth.uid()
    AND s.id IS NULL
    AND COALESCE(p.cancelled_at, p.expires_at) > now() - INTERVAL '14 days'
    AND (
      -- self-cancel: cancelled_reason NULL → admin 강제취소 제외
      (p.status = 'cancelled' AND p.cancelled_reason IS NULL)
      OR
      -- selecting_expired: offer_deadline 진입 후 만료
      (p.status = 'expired' AND p.offer_deadline IS NOT NULL)
    )
  ORDER BY COALESCE(p.cancelled_at, p.expires_at) DESC
  LIMIT 1;
$$;

-- ============================================================================
-- RPC 2: 설문 응답 제출 (유저용)
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_cancellation_survey(
  p_puzzle_id       UUID,
  p_reason_category puzzle_cancel_reason,
  p_reason_text     TEXT DEFAULT NULL
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

  -- 'other' 선택 시 자유서술 필수
  IF p_reason_category = 'other' AND (p_reason_text IS NULL OR trim(p_reason_text) = '') THEN
    RAISE EXCEPTION '기타 선택 시 내용을 입력해주세요';
  END IF;

  INSERT INTO puzzle_cancellation_surveys
    (puzzle_id, user_id, trigger_type, reason_category, reason_text)
  VALUES
    (p_puzzle_id, auth.uid(), v_trigger, p_reason_category, p_reason_text);
END;
$$;

-- ============================================================================
-- RPC 3: 사유별 집계 (admin용)
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_puzzle_cancellation_stats(
  p_from    DATE DEFAULT (now() - INTERVAL '30 days')::DATE,
  p_to      DATE DEFAULT now()::DATE,
  p_trigger TEXT DEFAULT NULL  -- NULL = 전체, 'self_cancelled' | 'selecting_expired'
)
RETURNS TABLE (
  reason_category TEXT,
  label           TEXT,
  cnt             BIGINT,
  ratio           NUMERIC
)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH filtered AS (
    SELECT reason_category
    FROM puzzle_cancellation_surveys
    WHERE responded_at::DATE BETWEEN p_from AND p_to
      AND (p_trigger IS NULL OR trigger_type::TEXT = p_trigger)
  ),
  totals AS (
    SELECT COUNT(*) AS total FROM filtered
  ),
  grouped AS (
    SELECT reason_category::TEXT, COUNT(*) AS cnt
    FROM filtered
    GROUP BY reason_category
  )
  SELECT
    g.reason_category,
    CASE g.reason_category
      WHEN 'schedule_change'    THEN '약속/일정이 바뀌어요'
      WHEN 'no_preferred_venue' THEN '원하는 장소가 없어요'
      WHEN 'weak_offers'        THEN '오퍼가 별로였어요'
      WHEN 'mind_change'        THEN '그냥 변심했어요'
      WHEN 'forgot_about_it'    THEN '올려놓고 잊어버렸어요'
      WHEN 'other'              THEN '기타'
      WHEN 'no_answer'          THEN '이유 모름/건너뜀'
    END AS label,
    g.cnt,
    CASE WHEN t.total = 0 THEN 0
         ELSE ROUND(g.cnt::NUMERIC / t.total * 100, 1)
    END AS ratio
  FROM grouped g
  CROSS JOIN totals t
  ORDER BY g.cnt DESC;
$$;
