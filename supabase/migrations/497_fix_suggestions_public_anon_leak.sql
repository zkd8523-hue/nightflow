-- Migration 497: suggestions_public 뷰 — 비로그인(anon) 마스킹 우회 버그 긴급 수정
--
-- 버그: 496의 CASE가 `s.author_id <> auth.uid()` 로 비교했는데, 비로그인 요청은
--       auth.uid() 가 NULL 이라 `author_id <> NULL` 이 NULL(3값 논리)이 된다.
--       `is_private(TRUE) AND NULL AND NOT is_admin()` 도 NULL 이 되어 WHEN 이
--       매칭되지 않고(NULL은 TRUE가 아님) ELSE로 빠져 title/content 원문이 그대로
--       노출됐다 — 비공개글이 비로그인 포함 전원에게 그대로 보인 상태였음.
--
-- 수정: `auth.uid() IS NULL OR author_id <> auth.uid()` 로 NULL 케이스를 명시적으로
--       먼저 처리. 로그인한 타인/비로그인 모두 마스킹, 작성자 본인/admin만 원문.

CREATE OR REPLACE VIEW suggestions_public AS
SELECT
  s.id,
  s.author_id,
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

COMMENT ON VIEW suggestions_public IS
  '건의 목록 피드. is_private=TRUE 글도 행 자체는 노출하되, 열람 권한(작성자/admin) 없는
   요청자(비로그인 포함)에게는 title/content 를 NULL 로 마스킹. auth.uid() IS NULL 케이스를
   명시적으로 처리(497) — 3값 논리로 비로그인 요청이 마스킹을 우회하던 버그 수정.
   상세 조회는 여전히 suggestions 테이블 직접 RLS로 차단.';
