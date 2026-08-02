-- ============================================================================
-- Migration 491: 방문 확인 리뷰 (사후 성사) + 어드민 승인 게이트
-- 날짜: 2026-07-20
-- 설명:
--   깃발이 매치 없이 만료돼도, 유저가 채팅/인스타 등으로 결국 파트너와 거래했을 수
--   있음. 만료 후 "다녀오셨어요? → 파트너 선택 → 별점/태그" 를 받아 파트너 평판에
--   반영한다. 단, 플랫폼이 검증 못 한 자기신고이므로 어드민 승인 후에만 공개.
--
--   설계:
--     - puzzle_reviews 에 status(pending/approved/rejected) + source(match/visit) 추가
--     - 기존 매치 리뷰는 status='approved', source='match' 로 백필 (동작 그대로)
--     - MD 평점 캐시/공개 조회는 approved 만 집계 (pending 은 프로필에 안 뜸)
--     - submit_visit_review(): 만료 깃발 + 오퍼한 파트너 중 선택 → status='pending'
--     - set_puzzle_review_status(): 어드민 전용 승인/반려
--     - pending 생성 시 어드민에게 in-app 알림
-- ============================================================================

-- 1) 컬럼 추가 (기존 행은 approved/match 로)
ALTER TABLE puzzle_reviews
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'match'
    CHECK (source IN ('match', 'visit')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_puzzle_reviews_status
  ON puzzle_reviews(status, created_at DESC) WHERE status = 'pending';

-- 2) 평점 캐시 트리거: approved 만 집계
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
    SELECT AVG(rating)::NUMERIC(3,2) AS avg_rating, COUNT(*) AS cnt
    FROM puzzle_reviews
    WHERE md_id = target_md_id AND status = 'approved'
  ) s
  WHERE u.id = target_md_id;

  RETURN NULL;
END;
$$;

-- 3) 공개 조회: approved 만
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
  reviewer_id UUID,
  reviewer_display_name TEXT,
  reviewer_profile_image TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.rating, r.comment, r.tags, r.created_at,
    c.name AS club_name,
    r.leader_id AS reviewer_id,
    COALESCE(u.display_name, '익명') AS reviewer_display_name,
    u.profile_image AS reviewer_profile_image
  FROM puzzle_reviews r
  LEFT JOIN clubs c ON c.id = r.club_id
  LEFT JOIN users u ON u.id = r.leader_id
  WHERE r.md_id = p_md_id AND r.status = 'approved'
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50))
  OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION get_md_reviews(UUID, INT, INT) TO anon, authenticated;

-- 4) 방문 확인 리뷰 제출 (status='pending')
--    조건: 방장 본인 + 종료된 본인 깃발 + 선택한 파트너가 이 깃발에 오퍼한 사람일 것.
CREATE OR REPLACE FUNCTION submit_visit_review(
  p_puzzle_id UUID,
  p_md_id UUID,
  p_rating INT,
  p_comment TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_puzzle RECORD;
  v_offer RECORD;
  v_review_id UUID;
  v_admin RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RETURN json_build_object('success', false, 'error', '별점은 1~5 사이여야 해요');
  END IF;

  SELECT id, leader_id, status INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle IS NULL THEN
    RETURN json_build_object('success', false, 'error', '깃발을 찾을 수 없어요');
  END IF;
  IF v_puzzle.leader_id <> v_user_id THEN
    RETURN json_build_object('success', false, 'error', '방장만 리뷰를 작성할 수 있어요');
  END IF;

  -- 선택한 파트너가 이 깃발에 실제로 오퍼했는지 검증 (임의 귀속 방지)
  SELECT md_id, club_id INTO v_offer
  FROM puzzle_offers
  WHERE puzzle_id = p_puzzle_id AND md_id = p_md_id
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_offer IS NULL THEN
    RETURN json_build_object('success', false, 'error', '이 깃발에 오퍼한 파트너가 아니에요');
  END IF;

  INSERT INTO puzzle_reviews (puzzle_id, leader_id, md_id, club_id, rating, comment, tags, status, source)
  VALUES (p_puzzle_id, v_user_id, p_md_id, v_offer.club_id,
          p_rating, NULLIF(TRIM(p_comment), ''), COALESCE(p_tags, '{}'), 'pending', 'visit')
  ON CONFLICT (puzzle_id, leader_id) DO UPDATE
  SET md_id = EXCLUDED.md_id, club_id = EXCLUDED.club_id, rating = EXCLUDED.rating,
      comment = EXCLUDED.comment, tags = EXCLUDED.tags,
      status = 'pending', source = 'visit', reviewed_by = NULL, reviewed_at = NULL,
      updated_at = now()
  RETURNING id INTO v_review_id;

  -- 어드민에게 검토 요청 in-app 알림
  FOR v_admin IN SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LOOP
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (v_admin.id, 'admin_visit_review_pending', '[관리자] 방문 리뷰 검토',
            '사후 방문 리뷰가 등록됐어요. 파트너 확인 후 승인해주세요.',
            '/admin/visit-reviews');
  END LOOP;

  -- 어드민 FCM 푸시 (Vault 인증, Migration 311)
  PERFORM notify_admins_push(
    '방문 리뷰 검토 요청',
    '사후 방문 리뷰가 등록됐어요. 파트너 확인 후 승인해주세요.',
    jsonb_build_object('type', 'admin_visit_review_pending', 'review_id', v_review_id::TEXT, 'url', '/admin/visit-reviews')
  );

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_visit_review(UUID, UUID, INT, TEXT, TEXT[]) TO authenticated;

-- 5) 어드민 승인/반려
CREATE OR REPLACE FUNCTION set_puzzle_review_status(
  p_review_id UUID,
  p_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_uid := auth.uid();
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN json_build_object('success', false, 'error', '관리자만 가능해요');
  END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('success', false, 'error', '잘못된 상태값');
  END IF;

  UPDATE puzzle_reviews
  SET status = p_status, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_review_id;
  -- 트리거가 approved 기준으로 평점 캐시를 자동 재계산함

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION set_puzzle_review_status(UUID, TEXT) TO authenticated;

-- 6) 어드민 pending 방문 리뷰 목록
CREATE OR REPLACE FUNCTION admin_list_pending_visit_reviews()
RETURNS TABLE (
  id UUID,
  puzzle_id UUID,
  rating INT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  md_id UUID,
  md_name TEXT,
  md_instagram TEXT,
  club_name TEXT,
  leader_name TEXT,
  event_date DATE,
  area TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.puzzle_id, r.rating, r.comment, r.tags, r.created_at,
    r.md_id, md.display_name, md.instagram,
    c.name, lu.display_name, p.event_date, p.area
  FROM puzzle_reviews r
  LEFT JOIN users md ON md.id = r.md_id
  LEFT JOIN users lu ON lu.id = r.leader_id
  LEFT JOIN clubs c ON c.id = r.club_id
  LEFT JOIN puzzles p ON p.id = r.puzzle_id
  WHERE r.status = 'pending' AND r.source = 'visit'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ORDER BY r.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION admin_list_pending_visit_reviews() TO authenticated;

COMMENT ON COLUMN puzzle_reviews.status IS 'pending(방문리뷰 검토대기)/approved/rejected. 매치리뷰는 approved 기본.';
COMMENT ON COLUMN puzzle_reviews.source IS 'match(플랫폼 매치) / visit(사후 방문 확인).';
