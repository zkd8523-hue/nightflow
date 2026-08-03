-- ============================================================================
-- Migration 503: 건의 카테고리에 'free'(자유) 추가
-- 날짜: 2026-07-20
-- 설명: 501의 category CHECK 제약에 free 추가 (자유게시판).
-- ============================================================================

ALTER TABLE suggestions DROP CONSTRAINT IF EXISTS suggestions_category_check;
ALTER TABLE suggestions
  ADD CONSTRAINT suggestions_category_check
  CHECK (category IN ('nightflow', 'culture', 'club_issue', 'free'));

COMMENT ON COLUMN suggestions.category IS
  'nightflow(나플 건의)/culture(클럽 문화)/club_issue(클럽 문제)/free(자유)';
