-- ============================================================================
-- Migration 501: 건의 게시판 카테고리 + 신고
-- 날짜: 2026-07-20
-- 설명:
--   (1) suggestions.category — 건의함을 "클럽 문화 토론의 장"으로 확장.
--       nightflow(나플 건의) / culture(클럽 문화 이야기) / club_issue(클럽 문제 제보)
--   (2) suggestion_reports — 다른 유저가 부적절 글 신고 → 관리자 딥링크 푸시(480 패턴)
-- ============================================================================

-- 1) 카테고리 컬럼 (기존 글은 nightflow)
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'nightflow'
    CHECK (category IN ('nightflow', 'culture', 'club_issue'));

COMMENT ON COLUMN suggestions.category IS
  'nightflow(나플 건의)/culture(클럽 문화 이야기)/club_issue(클럽 문제 제보)';

-- 2) 신고 테이블
CREATE TABLE IF NOT EXISTS suggestion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_reports_sug ON suggestion_reports(suggestion_id);
ALTER TABLE suggestion_reports ENABLE ROW LEVEL SECURITY;

-- 본인 신고만 INSERT, 어드민은 전체 SELECT
DROP POLICY IF EXISTS "own report insert" ON suggestion_reports;
CREATE POLICY "own report insert" ON suggestion_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "admin read reports" ON suggestion_reports;
CREATE POLICY "admin read reports" ON suggestion_reports
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- 3) 신고 RPC — 신고 기록 + 관리자 딥링크 푸시
CREATE OR REPLACE FUNCTION report_suggestion(
  p_suggestion_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_author UUID;
  v_title TEXT;
  v_reporter TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  SELECT author_id, title INTO v_author, v_title FROM suggestions WHERE id = p_suggestion_id AND is_deleted = false;
  IF v_author IS NULL THEN
    RETURN json_build_object('success', false, 'error', '글을 찾을 수 없어요');
  END IF;
  IF v_author = v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인 글은 신고할 수 없어요');
  END IF;

  INSERT INTO suggestion_reports (suggestion_id, reporter_id, reason)
  VALUES (p_suggestion_id, v_uid, NULLIF(TRIM(p_reason), ''))
  ON CONFLICT (suggestion_id, reporter_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = now();

  SELECT COALESCE(NULLIF(display_name, ''), '유저') INTO v_reporter FROM users WHERE id = v_uid;

  -- 관리자 딥링크 푸시 (480 패턴)
  PERFORM notify_admins_push_url(
    '🚨 건의 신고',
    COALESCE(v_reporter, '유저') || '님이 신고: ' || left(v_title, 24),
    '/suggestions/' || p_suggestion_id,
    jsonb_build_object('type', 'suggestion_report', 'suggestion_id', p_suggestion_id::TEXT)
  );

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION report_suggestion(UUID, TEXT) TO authenticated;

-- 4) 어드민: 신고 많은 글 목록 (검토용)
CREATE OR REPLACE FUNCTION admin_list_reported_suggestions()
RETURNS TABLE (
  suggestion_id UUID,
  title TEXT,
  category TEXT,
  author_name TEXT,
  report_count BIGINT,
  last_reported TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id, s.title, s.category,
    COALESCE(u.display_name, '유저'),
    COUNT(r.id), MAX(r.created_at)
  FROM suggestion_reports r
  JOIN suggestions s ON s.id = r.suggestion_id AND s.is_deleted = false
  LEFT JOIN users u ON u.id = s.author_id
  WHERE EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  GROUP BY s.id, s.title, s.category, u.display_name
  ORDER BY MAX(r.created_at) DESC;
$$;
GRANT EXECUTE ON FUNCTION admin_list_reported_suggestions() TO authenticated;

-- ============================================================================
-- 5) suggestions_public 뷰에 category 추가 (497 정의 + s.category)
--    카테고리는 비공개글이어도 노출 (title/content만 마스킹, 분류는 공개)
-- ============================================================================
-- CREATE OR REPLACE VIEW는 컬럼 중간 삽입 불가 → DROP 후 재생성 (category 끝에 추가해도 되지만
-- 명시적으로 재생성해 순서 자유롭게)
DROP VIEW IF EXISTS suggestions_public;
CREATE VIEW suggestions_public AS
SELECT
  s.id,
  s.author_id,
  s.category,
  CASE
    WHEN s.is_private
      AND (auth.uid() IS NULL OR s.author_id <> auth.uid())
      AND NOT public.is_admin()
    THEN NULL ELSE s.title
  END AS title,
  CASE
    WHEN s.is_private
      AND (auth.uid() IS NULL OR s.author_id <> auth.uid())
      AND NOT public.is_admin()
    THEN NULL ELSE s.content
  END AS content,
  s.is_private,
  s.like_count,
  s.comment_count,
  s.is_test,
  s.created_at,
  s.updated_at,
  p.display_name AS author_display_name,
  p.profile_image AS author_profile_image,
  p.role AS author_role
FROM suggestions s
JOIN public_user_profiles p ON p.id = s.author_id
WHERE s.is_deleted = FALSE;

GRANT SELECT ON suggestions_public TO anon, authenticated;
