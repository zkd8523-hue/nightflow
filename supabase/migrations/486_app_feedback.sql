-- ============================================================================
-- Migration 486: 네이티브 앱 유저 인앱 피드백 수집
-- 날짜: 2026-07-21
--
-- 앱을 실제로 써본 유저의 직접 피드백(별점 + 한 줄 의견)을 수집한다.
-- 노출은 클라이언트에서 "네이티브 앱 + 일정 인게이지먼트 이후"로 게이팅하고,
-- 여기서는 저장 테이블·제출 RPC·admin 집계 RPC만 둔다.
-- 175_puzzle_cancellation_surveys.sql 패턴을 그대로 따른다.
-- ============================================================================

-- 계정당 1건. 별점 1~5 + 선택 코멘트.
CREATE TABLE IF NOT EXISTS app_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT CHECK (char_length(comment) <= 300),
  platform   TEXT,  -- 'ios' | 'android' | 'web'(폴백)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON app_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_rating  ON app_feedback(rating, created_at DESC);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_inserts_own_feedback" ON app_feedback;
CREATE POLICY "user_inserts_own_feedback"
  ON app_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_sees_own_feedback" ON app_feedback;
CREATE POLICY "user_sees_own_feedback"
  ON app_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_reads_all_feedback" ON app_feedback;
CREATE POLICY "admin_reads_all_feedback"
  ON app_feedback FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 피드백 프롬프트 노출 완료 여부 (제출 or 최종 skip 시 TRUE). 445/482/483 패턴.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS app_feedback_prompt_seen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.app_feedback_prompt_seen
  IS '앱 피드백 프롬프트 노출 완료 여부 (계정당 1회, 제출 또는 최종 skip 시 TRUE)';

-- ============================================================================
-- RPC: 피드백 제출 (유저용) — INSERT + seen 플래그를 한 번에 처리
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_app_feedback(
  p_rating   SMALLINT,
  p_comment  TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION '별점은 1~5 사이여야 합니다';
  END IF;

  INSERT INTO app_feedback (user_id, rating, comment, platform)
  VALUES (auth.uid(), p_rating, NULLIF(trim(p_comment), ''), p_platform)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE users SET app_feedback_prompt_seen = TRUE WHERE id = auth.uid();
END;
$fn$;

-- ============================================================================
-- RPC: 최종 skip 마킹 (유저용) — 제출 없이 프롬프트만 영구 종료
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_app_feedback_seen()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  UPDATE users SET app_feedback_prompt_seen = TRUE WHERE id = auth.uid();
END;
$fn$;

-- ============================================================================
-- RPC: 집계 (admin용) — 평균·건수·별점분포 + 최근 코멘트
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_app_feedback_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_is_admin BOOLEAN;
  v_result   JSONB;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 조회할 수 있어요');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'total',   (SELECT count(*) FROM app_feedback),
    'avg',     (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM app_feedback),
    'dist',    (SELECT COALESCE(jsonb_object_agg(rating, cnt), '{}'::jsonb)
                FROM (SELECT rating, count(*) AS cnt FROM app_feedback GROUP BY rating) d),
    'recent',  (SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'created_at') DESC), '[]'::jsonb)
                FROM (
                  SELECT jsonb_build_object(
                    'name', COALESCE(NULLIF(u.display_name, ''), '회원'),
                    'rating', f.rating,
                    'comment', f.comment,
                    'platform', f.platform,
                    'created_at', f.created_at
                  ) AS r
                  FROM app_feedback f
                  JOIN users u ON u.id = f.user_id
                  ORDER BY f.created_at DESC
                  LIMIT 200
                ) recent)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
