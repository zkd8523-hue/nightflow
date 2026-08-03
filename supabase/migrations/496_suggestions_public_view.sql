-- Migration 496: 건의 게시판 — 비공개글도 "존재"는 노출 (제목/본문만 마스킹)
--
-- 배경:
--   495에서 is_private=TRUE 건의는 base table RLS로 완전히 숨겼는데(SELECT 자체 차단),
--   네이버 스마트스토어 Q&A처럼 "비밀글이 있다는 사실"은 다른 유저에게도 보여야
--   피드가 자연스럽다. 제목/본문만 가리고 목록엔 노출한다.
--
-- 방식: public_user_profiles(146) 와 동일한 패턴 — 마이그레이션 실행 계정(테이블 소유자)
--       이름으로 뷰를 만들면 뷰 자체는 base table 의 RLS 를 우회한다. 뷰 안에서
--       CASE 로 열람 권한 없는 요청자에게는 title/content 를 NULL 로 내려준다.
--       author 정보는 embed 대신 flat 컬럼으로 조인해 넣는다 — 뷰→뷰 PostgREST
--       embed(뷰 위에 얹힌 뷰를 다시 embed)는 버전에 따라 불안정하므로 피한다.
--
-- ⚠️ base suggestions 테이블 자체의 RLS(495)는 그대로 둔다 — 상세 페이지는 여전히
--    suggestions 테이블을 직접 조회하므로 비공개글 본문은 작성자+admin 외 접근 불가.
--    이 뷰는 "목록에서 존재만 보여주기" 용도로만 쓴다.

CREATE OR REPLACE VIEW suggestions_public AS
SELECT
  s.id,
  s.author_id,
  CASE
    WHEN s.is_private AND s.author_id <> auth.uid() AND NOT public.is_admin()
    THEN NULL ELSE s.title
  END AS title,
  CASE
    WHEN s.is_private AND s.author_id <> auth.uid() AND NOT public.is_admin()
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
   요청자에게는 title/content 를 NULL 로 마스킹. 클라이언트는 title IS NULL 이면
   자물쇠 placeholder 를 렌더링한다. 상세 조회는 여전히 suggestions 테이블 직접 RLS로 차단.';
