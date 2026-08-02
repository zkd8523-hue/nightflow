-- ============================================================================
-- Migration 494: 조각(파티) 참가자 상호 리뷰 + 방문 확인 (다음날 07시)
-- 날짜: 2026-07-20
-- 설명:
--   조각이 만료되면, 참여자 각자에게 다음날 아침 "다녀오셨어요? → 같이 간 사람들 평가"를
--   묻는다. 리뷰 대상은 파트너가 아니라 함께 논 다른 참여자(동등 상호평가).
--   긍정만: 👍(좋았어요) + 긍정 태그. 별점·부정 태그 없음(보복·처벌 방지, 노쇼정책 폐기).
--   결과는 각 유저 공개 프로필에 "파티 평판"으로 노출.
-- ============================================================================

-- 1) 참가자 방문 응답 (조각당 유저별 1행) — 리더/멤버 통합
CREATE TABLE IF NOT EXISTS puzzle_participant_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited BOOLEAN,
  not_visited_reason TEXT,
  prompted_at TIMESTAMPTZ,          -- 다음날 푸시 1회 기록
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participant_answers_user ON puzzle_participant_answers(user_id);
ALTER TABLE puzzle_participant_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own participant answers" ON puzzle_participant_answers;
CREATE POLICY "own participant answers" ON puzzle_participant_answers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) 참가자 상호 리뷰
CREATE TABLE IF NOT EXISTS puzzle_member_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, reviewer_id, reviewee_id),
  CHECK (reviewer_id <> reviewee_id)
);
CREATE INDEX IF NOT EXISTS idx_member_reviews_reviewee ON puzzle_member_reviews(reviewee_id);
ALTER TABLE puzzle_member_reviews ENABLE ROW LEVEL SECURITY;
-- 공개 노출(프로필) → 누구나 SELECT. 본인이 쓴 것만 INSERT.
DROP POLICY IF EXISTS "member reviews public read" ON puzzle_member_reviews;
CREATE POLICY "member reviews public read" ON puzzle_member_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "member reviews own insert" ON puzzle_member_reviews;
CREATE POLICY "member reviews own insert" ON puzzle_member_reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- 3) 유저 파티 평판 캐시 (받은 👍 수)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS party_like_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION refresh_party_like_cache()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target UUID;
BEGIN
  target := COALESCE(NEW.reviewee_id, OLD.reviewee_id);
  IF target IS NULL THEN RETURN NULL; END IF;
  UPDATE users SET party_like_count = (
    SELECT COUNT(*) FROM puzzle_member_reviews WHERE reviewee_id = target AND liked = true
  ) WHERE id = target;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_party_like_cache ON puzzle_member_reviews;
CREATE TRIGGER trg_party_like_cache
  AFTER INSERT OR UPDATE OR DELETE ON puzzle_member_reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_party_like_cache();

-- ============================================================================
-- 4) 참가자 목록 헬퍼: 조각의 참여자(멤버+리더) user_id 집합
-- ============================================================================
CREATE OR REPLACE FUNCTION party_participant_ids(p_puzzle_id UUID)
RETURNS TABLE (user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT uid FROM (
    SELECT user_id AS uid FROM puzzle_members WHERE puzzle_id = p_puzzle_id
    UNION
    SELECT leader_id FROM puzzles WHERE id = p_puzzle_id
  ) t WHERE uid IS NOT NULL;
$$;

-- 5) 대기 중인 파티 리뷰 1건 (현재 유저 기준) + 같이 간 사람들
CREATE OR REPLACE FUNCTION get_pending_party_review()
RETURNS TABLE (
  puzzle_id    UUID,
  event_date   DATE,
  area         TEXT,
  participants JSONB     -- 나 제외 다른 참여자들
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.event_date::DATE, p.area,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', u.id, 'display_name', u.display_name, 'profile_image', u.profile_image
      ))
      FROM party_participant_ids(p.id) pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.user_id <> auth.uid()
    ) AS participants
  FROM puzzles p
  WHERE p.is_recruiting_party = true
    AND p.status = 'expired'
    AND p.offer_deadline IS NOT NULL
    AND (p.event_date + INTERVAL '1 day 7 hours') AT TIME ZONE 'Asia/Seoul' <= now()
    AND p.expires_at > now() - INTERVAL '14 days'
    -- 현재 유저가 참여자
    AND EXISTS (SELECT 1 FROM party_participant_ids(p.id) x WHERE x.user_id = auth.uid())
    -- 아직 응답 안 함 (푸시로 prompted 행만 생겼을 땐 visited IS NULL → 여전히 대상)
    AND NOT EXISTS (
      SELECT 1 FROM puzzle_participant_answers a
      WHERE a.puzzle_id = p.id AND a.user_id = auth.uid() AND a.visited IS NOT NULL
    )
    -- 같이 간 사람이 1명이라도 있어야 (혼자면 평가 대상 없음)
    AND (SELECT COUNT(*) FROM party_participant_ids(p.id) y WHERE y.user_id <> auth.uid()) > 0
  ORDER BY p.expires_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_pending_party_review() TO authenticated;

-- 6) 방문 여부만 기록 (리뷰 없이 "네/아니요")
CREATE OR REPLACE FUNCTION answer_party_visit(
  p_puzzle_id UUID, p_visited BOOLEAN, p_not_visited_reason TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN json_build_object('success', false, 'error', '로그인이 필요해요'); END IF;
  IF NOT EXISTS (SELECT 1 FROM party_participant_ids(p_puzzle_id) x WHERE x.user_id = v_uid) THEN
    RETURN json_build_object('success', false, 'error', '참여한 조각만 가능해요');
  END IF;
  INSERT INTO puzzle_participant_answers (puzzle_id, user_id, visited, not_visited_reason)
  VALUES (p_puzzle_id, v_uid, p_visited,
          CASE WHEN p_visited THEN NULL ELSE NULLIF(TRIM(p_not_visited_reason), '') END)
  ON CONFLICT (puzzle_id, user_id) DO UPDATE
  SET visited = EXCLUDED.visited, not_visited_reason = EXCLUDED.not_visited_reason, answered_at = now();
  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION answer_party_visit(UUID, BOOLEAN, TEXT) TO authenticated;

-- 7) 파티원 리뷰 제출 (여러 명 한 번에) + 방문함으로 마킹
--    p_reviews: [{"reviewee_id": uuid, "liked": true, "tags": ["매너 좋아요", ...]}, ...]
CREATE OR REPLACE FUNCTION submit_party_review(
  p_puzzle_id UUID, p_reviews JSONB
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID; v_item JSONB; v_reviewee UUID; v_ok BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN json_build_object('success', false, 'error', '로그인이 필요해요'); END IF;
  IF NOT EXISTS (SELECT 1 FROM party_participant_ids(p_puzzle_id) x WHERE x.user_id = v_uid) THEN
    RETURN json_build_object('success', false, 'error', '참여한 조각만 가능해요');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_reviews, '[]'::jsonb)) LOOP
    v_reviewee := (v_item->>'reviewee_id')::UUID;
    -- 리뷰 대상이 실제 참여자인지 검증 + 자기자신 제외
    SELECT EXISTS (SELECT 1 FROM party_participant_ids(p_puzzle_id) x WHERE x.user_id = v_reviewee)
      INTO v_ok;
    IF NOT v_ok OR v_reviewee = v_uid THEN CONTINUE; END IF;

    INSERT INTO puzzle_member_reviews (puzzle_id, reviewer_id, reviewee_id, liked, tags)
    VALUES (
      p_puzzle_id, v_uid, v_reviewee,
      COALESCE((v_item->>'liked')::BOOLEAN, true),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'tags')), '{}')
    )
    ON CONFLICT (puzzle_id, reviewer_id, reviewee_id) DO UPDATE
    SET liked = EXCLUDED.liked, tags = EXCLUDED.tags;
  END LOOP;

  -- 리뷰 = 방문했다고 응답한 것
  INSERT INTO puzzle_participant_answers (puzzle_id, user_id, visited)
  VALUES (p_puzzle_id, v_uid, true)
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET visited = true, answered_at = now();

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_party_review(UUID, JSONB) TO authenticated;

-- 8) 공개 프로필용 파티 평판 (받은 👍 + 태그 집계)
CREATE OR REPLACE FUNCTION get_party_reputation(p_user_id UUID)
RETURNS TABLE (like_count INTEGER, tag TEXT, tag_count BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*)::INT FROM puzzle_member_reviews WHERE reviewee_id = p_user_id AND liked = true),
    t.tag, COUNT(*) AS tag_count
  FROM puzzle_member_reviews r, unnest(r.tags) AS t(tag)
  WHERE r.reviewee_id = p_user_id
  GROUP BY t.tag
  ORDER BY tag_count DESC
  LIMIT 6;
$$;
GRANT EXECUTE ON FUNCTION get_party_reputation(UUID) TO anon, authenticated;

-- ============================================================================
-- 9) 다음날 낮 푸시 — 어제 만료 조각의 미응답 참여자에게 "다녀오셨어요? 파티원 평가"
-- ============================================================================
CREATE OR REPLACE FUNCTION send_party_review_prompts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec RECORD; v_count INT := 0;
BEGIN
  FOR v_rec IN
    SELECT p.id AS puzzle_id, pp.user_id, p.area
    FROM puzzles p
    JOIN party_participant_ids(p.id) pp ON true
    WHERE p.is_recruiting_party = true
      AND p.status = 'expired'
      AND p.offer_deadline IS NOT NULL
      AND (p.event_date + INTERVAL '1 day 7 hours') AT TIME ZONE 'Asia/Seoul' <= now()
      AND p.expires_at > now() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_participant_answers a
        WHERE a.puzzle_id = p.id AND a.user_id = pp.user_id
      )
      -- 같이 간 사람 존재
      AND (SELECT COUNT(*) FROM party_participant_ids(p.id) y WHERE y.user_id <> pp.user_id) > 0
      -- 푸시 중복 방지: prompted 기록 없을 때만 (answers에 prompt만 남기기)
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_participant_answers a2
        WHERE a2.puzzle_id = p.id AND a2.user_id = pp.user_id AND a2.prompted_at IS NOT NULL
      )
    LIMIT 1000
  LOOP
    PERFORM notify_user_push(
      v_rec.user_id,
      COALESCE(v_rec.area, '어젯밤') || ' 파티 어떠셨어요? 🎉',
      '같이 간 사람들을 평가해주세요. 좋은 파티원에게 큰 힘이 돼요!',
      jsonb_build_object('type', 'party_review_prompt', 'puzzle_id', v_rec.puzzle_id),
      '/',
      'review_request'
    );
    -- prompt 기록 (visited는 아직 NULL — 응답 아님, 푸시 발송만 표시)
    INSERT INTO puzzle_participant_answers (puzzle_id, user_id, prompted_at, answered_at)
    VALUES (v_rec.puzzle_id, v_rec.user_id, now(), now())
    ON CONFLICT (puzzle_id, user_id) DO UPDATE SET prompted_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION send_party_review_prompts() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('party-review-prompts-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'party-review-prompts-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('party-review-prompts-daily', '5 4 * * *', $$SELECT send_party_review_prompts();$$);

-- ============================================================================
-- 10) 어드민 집계 — 파티 방문응답 + 상호리뷰 통계
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_party_review_stats()
RETURNS JSON
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role='admin')
    THEN json_build_object('error','관리자만')
    ELSE json_build_object(
      -- 방문 응답 집계
      'answered_total',   (SELECT COUNT(*) FROM puzzle_participant_answers WHERE visited IS NOT NULL),
      'visited_yes',      (SELECT COUNT(*) FROM puzzle_participant_answers WHERE visited = true),
      'visited_no',       (SELECT COUNT(*) FROM puzzle_participant_answers WHERE visited = false),
      -- 미방문 사유 집계
      'not_visited_reasons', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(NULLIF(TRIM(not_visited_reason),''),'(사유 없음)') AS reason, COUNT(*) AS cnt
          FROM puzzle_participant_answers WHERE visited = false GROUP BY 1
        ) r
      ),
      -- 상호 리뷰 집계
      'reviews_total',    (SELECT COUNT(*) FROM puzzle_member_reviews),
      'likes_total',      (SELECT COUNT(*) FROM puzzle_member_reviews WHERE liked = true),
      'top_tags', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('tag', tag, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
        FROM (
          SELECT t.tag, COUNT(*) AS cnt
          FROM puzzle_member_reviews r, unnest(r.tags) AS t(tag)
          GROUP BY t.tag ORDER BY cnt DESC LIMIT 10
        ) tg
      )
    )
  END;
$$;
GRANT EXECUTE ON FUNCTION admin_party_review_stats() TO authenticated;
