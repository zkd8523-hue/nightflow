-- Migration 260: puzzle_reviews 테이블 + RLS + 트리거 + RPC
-- 깃발 매치 후 방장이 MD/클럽에 대해 작성하는 별점/태그/멘트 리뷰.
-- 1방장 × 1깃발 = 1리뷰 (UNIQUE puzzle_id, leader_id)
-- 패널티 시스템 없음 (project_noshow_policy_change). 신뢰 표시·MD 평점 캐시 용도.

CREATE TABLE IF NOT EXISTS puzzle_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, leader_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_reviews_md_id_created_at
  ON puzzle_reviews (md_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_puzzle_reviews_leader_id
  ON puzzle_reviews (leader_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_reviews_club_id
  ON puzzle_reviews (club_id);

ALTER TABLE puzzle_reviews ENABLE ROW LEVEL SECURITY;

-- RLS: 누구나 SELECT 가능 (공개 리뷰). 본인이 쓴 리뷰만 INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "puzzle_reviews_select_all" ON puzzle_reviews;
CREATE POLICY "puzzle_reviews_select_all" ON puzzle_reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "puzzle_reviews_insert_own" ON puzzle_reviews;
CREATE POLICY "puzzle_reviews_insert_own" ON puzzle_reviews
  FOR INSERT WITH CHECK (leader_id = auth.uid());

DROP POLICY IF EXISTS "puzzle_reviews_update_own" ON puzzle_reviews;
CREATE POLICY "puzzle_reviews_update_own" ON puzzle_reviews
  FOR UPDATE USING (leader_id = auth.uid()) WITH CHECK (leader_id = auth.uid());

DROP POLICY IF EXISTS "puzzle_reviews_delete_own_or_admin" ON puzzle_reviews;
CREATE POLICY "puzzle_reviews_delete_own_or_admin" ON puzzle_reviews
  FOR DELETE USING (
    leader_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION puzzle_reviews_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_puzzle_reviews_updated_at ON puzzle_reviews;
CREATE TRIGGER trg_puzzle_reviews_updated_at
  BEFORE UPDATE ON puzzle_reviews
  FOR EACH ROW EXECUTE FUNCTION puzzle_reviews_set_updated_at();

-- MD 평점 캐시 갱신 트리거 (users.md_avg_rating, md_review_count)
CREATE OR REPLACE FUNCTION puzzle_reviews_refresh_md_cache()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_md_id UUID;
BEGIN
  target_md_id := COALESCE(NEW.md_id, OLD.md_id);
  IF target_md_id IS NULL THEN RETURN NULL; END IF;

  UPDATE users u
  SET
    md_avg_rating = COALESCE(s.avg_rating, 0),
    md_review_count = COALESCE(s.cnt, 0)
  FROM (
    SELECT
      AVG(rating)::NUMERIC(3,2) AS avg_rating,
      COUNT(*) AS cnt
    FROM puzzle_reviews
    WHERE md_id = target_md_id
  ) s
  WHERE u.id = target_md_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_puzzle_reviews_refresh_cache_iud ON puzzle_reviews;
CREATE TRIGGER trg_puzzle_reviews_refresh_cache_iud
  AFTER INSERT OR UPDATE OR DELETE ON puzzle_reviews
  FOR EACH ROW EXECUTE FUNCTION puzzle_reviews_refresh_md_cache();

-- ============================================================================
-- RPC: submit_puzzle_review
-- 방장이 매치된 깃발에 대해 리뷰 작성 (1회 한정, UPSERT)
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_puzzle_review(
  p_puzzle_id UUID,
  p_rating INT,
  p_comment TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_puzzle RECORD;
  v_offer RECORD;
  v_review_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RETURN json_build_object('success', false, 'error', '별점은 1~5 사이여야 해요');
  END IF;

  SELECT id, leader_id, status, accepted_offer_id
  INTO v_puzzle
  FROM puzzles
  WHERE id = p_puzzle_id;

  IF v_puzzle IS NULL THEN
    RETURN json_build_object('success', false, 'error', '깃발을 찾을 수 없어요');
  END IF;

  IF v_puzzle.leader_id <> v_user_id THEN
    RETURN json_build_object('success', false, 'error', '방장만 리뷰를 작성할 수 있어요');
  END IF;

  IF v_puzzle.status <> 'accepted' THEN
    RETURN json_build_object('success', false, 'error', '매치된 깃발만 리뷰 가능해요');
  END IF;

  IF v_puzzle.accepted_offer_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '수락된 오퍼 정보가 없어요');
  END IF;

  SELECT md_id, club_id
  INTO v_offer
  FROM puzzle_offers
  WHERE id = v_puzzle.accepted_offer_id;

  IF v_offer IS NULL OR v_offer.md_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'MD 정보를 찾을 수 없어요');
  END IF;

  -- UPSERT
  INSERT INTO puzzle_reviews (puzzle_id, leader_id, md_id, club_id, rating, comment, tags)
  VALUES (p_puzzle_id, v_user_id, v_offer.md_id, v_offer.club_id, p_rating, NULLIF(TRIM(p_comment), ''), COALESCE(p_tags, '{}'))
  ON CONFLICT (puzzle_id, leader_id) DO UPDATE
  SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    tags = EXCLUDED.tags,
    updated_at = now()
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_puzzle_review(UUID, INT, TEXT, TEXT[]) TO authenticated;

-- ============================================================================
-- RPC: get_md_reviews
-- MD 공개 프로필용 리뷰 목록 조회 (식별 가능 정보 최소화)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_md_reviews(
  p_md_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  rating INT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  club_name TEXT,
  reviewer_display_name TEXT,
  reviewer_profile_image TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.rating,
    r.comment,
    r.tags,
    r.created_at,
    c.name AS club_name,
    COALESCE(u.display_name, '익명') AS reviewer_display_name,
    u.profile_image AS reviewer_profile_image
  FROM puzzle_reviews r
  LEFT JOIN clubs c ON c.id = r.club_id
  LEFT JOIN users u ON u.id = r.leader_id
  WHERE r.md_id = p_md_id
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50))
  OFFSET GREATEST(0, p_offset);
$$;

GRANT EXECUTE ON FUNCTION get_md_reviews(UUID, INT, INT) TO anon, authenticated;

COMMENT ON TABLE puzzle_reviews IS
  '깃발 매치 후 방장 → MD 별점/태그/멘트 리뷰. 1방장×1깃발=1리뷰. 패널티 X. MD 평점 캐시 트리거 연동.';
COMMENT ON FUNCTION submit_puzzle_review(UUID, INT, TEXT, TEXT[]) IS
  '방장이 매치된 깃발에 대해 리뷰 작성/수정 (UPSERT). 별점 1~5, 태그/멘트 선택.';
COMMENT ON FUNCTION get_md_reviews(UUID, INT, INT) IS
  'MD 공개 프로필용 리뷰 목록 (최신순). 익명도 호출 가능.';
