-- 597: 공연(club_events) 기대돼요
--
-- 배경
--   596에서 라인업(club_lineups)에 붙인 기대돼요를 공연 상세에도 그대로 준다.
--   두 화면은 유저에게 같은 것으로 보이지만("이 밤 기대된다") 원본 테이블이 다르다:
--     club_lineups  = 클럽이 올린 그날 DJ 타임테이블 (클럽×영업일 UNIQUE)
--     club_events   = 인스타에서 긁어온 공연 (제목·아티스트 중심, 클럽 미등록도 있음)
--   lineup_likes.lineup_id는 club_lineups(id) FK라 공연 id를 넣을 수 없다.
--
-- 왜 별도 테이블인가
--   한 테이블에 (target_type, target_id)로 합치면 FK가 죽는다(다형 참조는 참조무결성
--   보장 불가 → 공연이 지워져도 좋아요가 남는다). 596이 CASCADE로 얻은 정리를 잃는 게
--   합치는 값어치보다 크다. 구조가 동일하므로 훅은 하나를 공유한다.

CREATE TABLE IF NOT EXISTS event_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 테스트 계정 표시 — 프로덕션 집계 제외 기준은 이름 매칭이 아니라 이 컬럼이다
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_likes_event ON event_likes(event_id);
CREATE INDEX IF NOT EXISTS idx_event_likes_user ON event_likes(user_id);

ALTER TABLE event_likes ENABLE ROW LEVEL SECURITY;

-- 읽기: 전체 공개. 비로그인도 "몇 명이 기대하는지"는 봐야 참여 유인이 생긴다(596과 동일).
DROP POLICY IF EXISTS "Anyone can read event likes" ON event_likes;
CREATE POLICY "Anyone can read event likes" ON event_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Login users can like event" ON event_likes;
CREATE POLICY "Login users can like event" ON event_likes
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

DROP POLICY IF EXISTS "Delete own event like" ON event_likes;
CREATE POLICY "Delete own event like" ON event_likes
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

CREATE OR REPLACE FUNCTION mark_event_like_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE) INTO NEW.is_test
    FROM users u WHERE u.id = NEW.user_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_event_like_is_test ON event_likes;
CREATE TRIGGER trg_event_like_is_test
  BEFORE INSERT ON event_likes
  FOR EACH ROW EXECUTE FUNCTION mark_event_like_is_test();

/**
 * 목록 화면용 집계 — get_lineup_like_counts()와 같은 시그니처를 유지한다.
 * 반환 컬럼명도 lineup_id 그대로 둔다: 훅(useLineupLikes)이 두 RPC를 이름만 바꿔
 * 호출하므로, 컬럼명이 갈리면 훅 안에 분기가 생긴다.
 */
CREATE OR REPLACE FUNCTION get_event_like_counts(
  p_lineup_ids UUID[],
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (lineup_id UUID, like_count BIGINT, liked_by_me BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.id AS lineup_id,
    COUNT(lk.id) AS like_count,
    BOOL_OR(lk.user_id = p_user_id) IS TRUE AS liked_by_me
  FROM unnest(p_lineup_ids) AS l(id)
  LEFT JOIN event_likes lk ON lk.event_id = l.id
  GROUP BY l.id;
$$;

GRANT EXECUTE ON FUNCTION get_event_like_counts(UUID[], UUID) TO anon, authenticated;
