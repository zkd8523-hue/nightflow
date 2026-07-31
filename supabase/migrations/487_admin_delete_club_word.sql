-- Migration 487: 관리자 워드클라우드(5자 리뷰) 단어 삭제
--
-- 배경: 클럽 상세의 5자 리뷰 워드클라우드에 악의적 단어("성병집합소" 등)가 올라와도
--       admin이 지울 수단이 없었음. RLS는 club_word_clouds DELETE만 admin에 열려 있어
--       (313), 단어가 2개인 row에서 한 단어만 제거하는 건 불가능했다.
--
-- 이 RPC는 SECURITY DEFINER로 정규화 기준(lower + 연속공백 1칸 + trim,
-- src/lib/clubs/wordCloud.ts의 normalizeWord와 동일)으로 매칭해서
--   - words 배열에서 해당 단어만 제거
--   - 제거 후 빈 배열이 되는 row는 삭제 (words CHECK: 1~2개)
--   - 전체 삭제일 때만 해당 단어 좋아요(club_word_cloud_likes)도 정리
-- p_author_id를 주면 그 작성자 row에서만 제거(특정 유저만 조치).
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.admin_delete_club_word(
  p_club_id UUID,
  p_word TEXT,
  p_author_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
  v_rows_deleted INTEGER := 0;
  v_rows_updated INTEGER := 0;
  v_likes_deleted INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 리뷰를 삭제할 수 있습니다' USING ERRCODE = '42501';
  END IF;

  v_norm := btrim(regexp_replace(lower(COALESCE(p_word, '')), '\s+', ' ', 'g'));
  IF v_norm = '' THEN
    RAISE EXCEPTION '삭제할 단어가 비어 있습니다' USING ERRCODE = '22023';
  END IF;

  WITH target AS (
    SELECT
      c.id,
      ARRAY(
        SELECT w
        FROM unnest(c.words) AS w
        WHERE btrim(regexp_replace(lower(w), '\s+', ' ', 'g')) <> v_norm
      ) AS next_words
    FROM club_word_clouds c
    WHERE c.club_id = p_club_id
      AND (p_author_id IS NULL OR c.author_id = p_author_id)
      AND EXISTS (
        SELECT 1
        FROM unnest(c.words) AS w
        WHERE btrim(regexp_replace(lower(w), '\s+', ' ', 'g')) = v_norm
      )
  ),
  del AS (
    DELETE FROM club_word_clouds c
    USING target t
    WHERE c.id = t.id AND cardinality(t.next_words) = 0
    RETURNING c.id
  ),
  upd AS (
    UPDATE club_word_clouds c
    SET words = t.next_words
    FROM target t
    WHERE c.id = t.id AND cardinality(t.next_words) > 0
    RETURNING c.id
  )
  SELECT
    (SELECT COUNT(*) FROM del),
    (SELECT COUNT(*) FROM upd)
  INTO v_rows_deleted, v_rows_updated;

  -- 단어를 클럽에서 통째로 내리는 경우에만 좋아요도 정리
  IF p_author_id IS NULL THEN
    DELETE FROM club_word_cloud_likes l
    WHERE l.club_id = p_club_id
      AND btrim(regexp_replace(lower(l.normalized_word), '\s+', ' ', 'g')) = v_norm;
    GET DIAGNOSTICS v_likes_deleted = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'success', true,
    'normalized_word', v_norm,
    'removed_from', v_rows_deleted + v_rows_updated,
    'rows_deleted', v_rows_deleted,
    'rows_updated', v_rows_updated,
    'likes_deleted', v_likes_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_club_word(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_club_word(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_club_word(UUID, TEXT, UUID) IS
  '관리자 전용: 클럽 워드클라우드에서 특정 단어 제거(정규화 매칭). p_author_id 지정 시 해당 작성자만, NULL이면 클럽 전체 + 좋아요 정리';
