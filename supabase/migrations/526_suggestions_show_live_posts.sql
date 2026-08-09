-- Migration 526: 자유게시판 글이 프로덕션에서 안 보이던 문제 해결
--
-- 증상: 로컬/프리뷰에서는 게시판에 글이 보이는데, 프로덕션(nightflow.kr)에서는
--       "아직 글이 없어요"만 뜬다. 비공개글이 있어도 남들이 "누가 비밀글을 썼구나"를
--       인지할 수 없다.
--
-- 원인: 495의 trg_mark_suggestion_is_test 트리거가 작성자 users.is_test 를 글에 복사한다.
--       현재 DB의 모든 글이 테스트로 마킹된 계정(admin "NightFlow.kr", md "123123") 작성분이라
--       is_test=TRUE 가 박혔고, useSuggestions 의 hideTestData() 가 프로덕션에서만
--       .eq("is_test", false) 를 걸어 전부 필터링됐다.
--
-- 해결:
--   1) 살아있는 글/댓글의 is_test 를 해제 — 비공개글은 suggestions_public 뷰(497)가
--      title/content 를 NULL 로 마스킹하므로, 남들에게는 "비밀글이에요" 카드로만 보인다.
--      본문 유출 없음.
--   2) 앞으로 admin(공식 계정) 작성 글은 테스트로 마킹하지 않는다 — 운영 공지/시드 글이
--      다시 프로덕션에서 사라지는 재발 방지. 일반 테스트 계정(md/user) 글은 그대로 숨김 유지.

-- ============================================
-- 1) 기존 살아있는 글/댓글 노출 복구 (백필)
-- ============================================
UPDATE suggestions
   SET is_test = FALSE
 WHERE is_deleted = FALSE
   AND is_test = TRUE;

UPDATE suggestion_comments c
   SET is_test = FALSE
  FROM suggestions s
 WHERE s.id = c.suggestion_id
   AND s.is_test = FALSE
   AND c.is_test = TRUE;

-- ============================================
-- 2) 트리거 — admin 작성 글은 테스트 마킹 제외
-- ============================================
CREATE OR REPLACE FUNCTION mark_suggestion_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- admin 은 공식 계정이므로 users.is_test 와 무관하게 항상 노출한다.
  SELECT COALESCE(u.is_test, FALSE) AND u.role <> 'admin'
    INTO NEW.is_test
    FROM users u
    WHERE u.id = NEW.author_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mark_suggestion_is_test() IS
  '건의/댓글 INSERT 시 작성자 users.is_test 를 복사해 프로덕션 노출을 제어.
   526부터 role=admin 작성분은 예외 — 공식 계정 글은 항상 노출.';
