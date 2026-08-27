-- 596: 라인업(클럽×영업일) 좋아요
--
-- 배경
--   카드의 기존 하트는 user_favorite_clubs = "이 클럽을 단골로 찜"이라 8/27 Bolero와
--   8/28 Bolero가 같은 하트를 공유한다. "오늘 이 라인업 좋다"는 신호를 못 받는다.
--   그래서 클럽 찜은 그대로 두고, club_lineups(id)에 붙는 날짜별 좋아요를 따로 만든다.
--
--   club_lineups는 UNIQUE(club_id, event_date)라 클럽×영업일 = 1건이고,
--   upsert_club_lineup()이 ON CONFLICT DO UPDATE라 재편집해도 id가 보존된다
--   (559_lineups_rls.sql) → 좋아요가 날아가지 않는다.
--
-- 범위
--   좋아요만. 댓글은 참여 신호를 확인한 뒤에 별도로 붙인다.

CREATE TABLE IF NOT EXISTS lineup_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id  UUID NOT NULL REFERENCES club_lineups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 테스트 계정 표시 — 프로덕션 집계에서 걸러내는 기준은 이름 매칭이 아니라 이 컬럼이다
  is_test    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 한 사람이 한 라인업에 한 번만
  UNIQUE(lineup_id, user_id)
);

-- 카드마다 "내가 눌렀나 + 총 몇 개"를 묻는다 → lineup_id 선두 인덱스
CREATE INDEX IF NOT EXISTS idx_lineup_likes_lineup ON lineup_likes(lineup_id);
CREATE INDEX IF NOT EXISTS idx_lineup_likes_user ON lineup_likes(user_id);

ALTER TABLE lineup_likes ENABLE ROW LEVEL SECURITY;

-- 읽기: 전체 공개. club_lineups 자체가 SELECT USING (true)라(559) 좋아요 수도 익명에게 보인다.
-- 비로그인도 "몇 명이 좋아하는지"는 봐야 참여 유인이 생긴다.
DROP POLICY IF EXISTS "Anyone can read lineup likes" ON lineup_likes;
CREATE POLICY "Anyone can read lineup likes" ON lineup_likes
  FOR SELECT USING (true);

-- 쓰기: 로그인 + 본인 것만 + 정지/탈퇴 계정 제외 (284의 헬퍼 재사용)
DROP POLICY IF EXISTS "Login users can like lineup" ON lineup_likes;
CREATE POLICY "Login users can like lineup" ON lineup_likes
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

-- 취소: 본인 것 또는 관리자
DROP POLICY IF EXISTS "Delete own lineup like" ON lineup_likes;
CREATE POLICY "Delete own lineup like" ON lineup_likes
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- is_test 자동 마킹 — 495_suggestions_board.sql의 mark_suggestion_is_test() 패턴
CREATE OR REPLACE FUNCTION mark_lineup_like_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(u.is_test, FALSE) INTO NEW.is_test
    FROM users u WHERE u.id = NEW.user_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lineup_like_is_test ON lineup_likes;
CREATE TRIGGER trg_lineup_like_is_test
  BEFORE INSERT ON lineup_likes
  FOR EACH ROW EXECUTE FUNCTION mark_lineup_like_is_test();

/**
 * 목록 화면용 집계 — 카드가 N개면 쿼리도 N개가 되지 않게 한 번에 받는다.
 * 비로그인은 p_user_id를 NULL로 넘기면 liked_by_me가 전부 false.
 * 테스트 계정의 좋아요는 집계에서 제외한다(프로덕션 숫자를 오염시키지 않게).
 */
CREATE OR REPLACE FUNCTION get_lineup_like_counts(
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
  LEFT JOIN lineup_likes lk ON lk.lineup_id = l.id
  GROUP BY l.id;
$$;

GRANT EXECUTE ON FUNCTION get_lineup_like_counts(UUID[], UUID) TO anon, authenticated;
