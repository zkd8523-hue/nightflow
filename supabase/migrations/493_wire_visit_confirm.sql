-- ============================================================================
-- Migration 493: 방문 확인 시트 실제 배선 + 옛 "미선택 이유" 설문 제거
-- 날짜: 2026-07-20
-- 설명:
--   (1) 만료 깃발에 뜨던 옛 "왜 안 골랐어요" 설문(selecting_expired)을 없앤다.
--       get_pending_cancellation_survey 는 이제 직접 취소(self_cancelled)만 반환.
--   (2) 대신 "다녀오셨어요?" 방문 확인 시트가 뜨도록 트리거용 RPC/컬럼 추가.
--       - puzzles.visit_confirm_answered_at / visit_confirmed 로 응답 여부·결과 기록
--       - get_pending_visit_confirm(): 응답 안 한 만료 깃발 1건 + 오퍼한 파트너 목록
--       - answer_visit_confirm(): 방문 여부만 기록 (리뷰 없이 "네/아니요")
--       - submit_visit_review() 도 응답함으로 마킹하도록 갱신
-- ============================================================================

-- 1) 응답 기록 컬럼
ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS visit_confirm_answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visit_confirmed BOOLEAN,
  ADD COLUMN IF NOT EXISTS visit_confirm_prompted_at TIMESTAMPTZ,  -- 다음날 푸시 1회 발송 기록
  ADD COLUMN IF NOT EXISTS not_visited_reason TEXT;  -- "안 갔어요" 사유

-- 2) 옛 설문에서 selecting_expired 제거 → self_cancelled 만
CREATE OR REPLACE FUNCTION get_pending_cancellation_survey()
RETURNS TABLE (
  puzzle_id    UUID,
  trigger_type puzzle_survey_trigger,
  club_label   TEXT,
  event_date   DATE,
  occurred_at  TIMESTAMPTZ
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    'self_cancelled'::puzzle_survey_trigger AS trigger_type,
    COALESCE(c.name, '미지정')  AS club_label,
    p.event_date::DATE          AS event_date,
    p.cancelled_at              AS occurred_at
  FROM puzzles p
  LEFT JOIN clubs c ON c.id = (
    SELECT club_id FROM puzzle_offers WHERE puzzle_id = p.id AND status = 'accepted' LIMIT 1
  )
  LEFT JOIN puzzle_cancellation_surveys s
    ON s.puzzle_id = p.id AND s.user_id = auth.uid()
  WHERE p.leader_id = auth.uid()
    AND s.id IS NULL
    AND p.cancelled_at > now() - INTERVAL '14 days'
    AND p.status = 'cancelled' AND p.cancelled_reason IS NULL
  ORDER BY p.cancelled_at DESC
  LIMIT 1;
$$;

-- 3) 방문 확인 대상 깃발 1건 + 파트너 목록
--    조건: 본인 · 만료(offer_deadline 있던 정식 깃발) · 아직 응답 안 함 · 14일 이내 · 오퍼 있었음
CREATE OR REPLACE FUNCTION get_pending_visit_confirm()
RETURNS TABLE (
  puzzle_id    UUID,
  club_label   TEXT,
  event_date   DATE,
  area         TEXT,
  total_budget INTEGER,
  is_recruiting_party BOOLEAN,
  partners     JSONB
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.notes AS club_label,
    p.event_date::DATE,
    p.area,
    p.total_budget,
    COALESCE(p.is_recruiting_party, false),
    (
      SELECT jsonb_agg(x) FROM (
        SELECT DISTINCT jsonb_build_object(
          'md_id', po.md_id,
          'display_name', u.display_name,
          'profile_image', u.profile_image,
          'instagram', u.instagram,
          'club_name', c2.name
        ) AS x
        FROM puzzle_offers po
        JOIN users u ON u.id = po.md_id
        LEFT JOIN clubs c2 ON c2.id = po.club_id
        WHERE po.puzzle_id = p.id AND po.md_id IS NOT NULL
      ) sub
    ) AS partners
  FROM puzzles p
  WHERE p.leader_id = auth.uid()
    AND p.status = 'expired'
    AND p.offer_deadline IS NOT NULL
    AND p.visit_confirm_answered_at IS NULL
    -- 밤이 끝난 뒤에만 질문: 이벤트 다음날 아침 07:00 KST 이후부터 노출
    AND (p.event_date + INTERVAL '1 day 7 hours') AT TIME ZONE 'Asia/Seoul' <= now()
    AND p.expires_at > now() - INTERVAL '14 days'
    AND EXISTS (SELECT 1 FROM puzzle_offers po2 WHERE po2.puzzle_id = p.id AND po2.md_id IS NOT NULL)
  ORDER BY p.expires_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_pending_visit_confirm() TO authenticated;

-- 4) 방문 여부만 기록 (리뷰 없이 "네/아니요"). 안 갔으면 사유도 저장.
CREATE OR REPLACE FUNCTION answer_visit_confirm(
  p_puzzle_id UUID,
  p_did_visit BOOLEAN,
  p_not_visited_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID; v_leader UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN json_build_object('success', false, 'error', '로그인이 필요해요'); END IF;
  SELECT leader_id INTO v_leader FROM puzzles WHERE id = p_puzzle_id;
  IF v_leader IS NULL OR v_leader <> v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인 깃발만 가능해요');
  END IF;
  UPDATE puzzles
  SET visit_confirm_answered_at = now(),
      visit_confirmed = p_did_visit,
      not_visited_reason = CASE WHEN p_did_visit THEN NULL ELSE NULLIF(TRIM(p_not_visited_reason), '') END
  WHERE id = p_puzzle_id;
  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION answer_visit_confirm(UUID, BOOLEAN, TEXT) TO authenticated;

-- 5) submit_visit_review() 갱신 — 리뷰 제출도 "응답함(방문함)"으로 마킹
CREATE OR REPLACE FUNCTION submit_visit_review(
  p_puzzle_id UUID, p_md_id UUID, p_rating INT,
  p_comment TEXT DEFAULT NULL, p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_puzzle RECORD; v_offer RECORD; v_review_id UUID; v_admin RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', '로그인이 필요해요'); END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RETURN json_build_object('success', false, 'error', '별점은 1~5 사이여야 해요'); END IF;

  SELECT id, leader_id, status INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;
  IF v_puzzle IS NULL THEN RETURN json_build_object('success', false, 'error', '깃발을 찾을 수 없어요'); END IF;
  IF v_puzzle.leader_id <> v_user_id THEN RETURN json_build_object('success', false, 'error', '방장만 리뷰를 작성할 수 있어요'); END IF;

  SELECT md_id, club_id INTO v_offer FROM puzzle_offers
  WHERE puzzle_id = p_puzzle_id AND md_id = p_md_id ORDER BY created_at DESC LIMIT 1;
  IF v_offer IS NULL THEN RETURN json_build_object('success', false, 'error', '이 깃발에 오퍼한 파트너가 아니에요'); END IF;

  INSERT INTO puzzle_reviews (puzzle_id, leader_id, md_id, club_id, rating, comment, tags, status, source)
  VALUES (p_puzzle_id, v_user_id, p_md_id, v_offer.club_id, p_rating, NULLIF(TRIM(p_comment), ''), COALESCE(p_tags, '{}'), 'pending', 'visit')
  ON CONFLICT (puzzle_id, leader_id) DO UPDATE
  SET md_id = EXCLUDED.md_id, club_id = EXCLUDED.club_id, rating = EXCLUDED.rating,
      comment = EXCLUDED.comment, tags = EXCLUDED.tags,
      status = 'pending', source = 'visit', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
  RETURNING id INTO v_review_id;

  -- 리뷰 제출 = 방문했다고 응답한 것 → 재질문 안 하도록 마킹
  UPDATE puzzles SET visit_confirm_answered_at = now(), visit_confirmed = true WHERE id = p_puzzle_id;

  FOR v_admin IN SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LOOP
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (v_admin.id, 'admin_visit_review_pending', '[관리자] 방문 리뷰 검토',
            '사후 방문 리뷰가 등록됐어요. 파트너 확인 후 승인해주세요.', '/admin/visit-reviews');
  END LOOP;

  PERFORM notify_admins_push('방문 리뷰 검토 요청',
    '사후 방문 리뷰가 등록됐어요. 파트너 확인 후 승인해주세요.',
    jsonb_build_object('type','admin_visit_review_pending','review_id',v_review_id::TEXT,'url','/admin/visit-reviews'));

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_visit_review(UUID, UUID, INT, TEXT, TEXT[]) TO authenticated;

-- ============================================================================
-- 6) 다음날 낮 푸시 발송 — 어젯밤 만료 깃발(오퍼 있던)의 방장에게 "다녀오셨어요? 리뷰" 유도
--    앱 깐 사람(디바이스 토큰 有)에게만 실제 발송 (notify_user_push 내부에서 처리).
--    깃발당 1회(visit_confirm_prompted_at). 이미 응답했으면 제외.
-- ============================================================================
CREATE OR REPLACE FUNCTION send_visit_confirm_prompts()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec RECORD;
  v_count INT := 0;
BEGIN
  FOR v_rec IN
    SELECT p.id, p.leader_id, p.area
    FROM puzzles p
    WHERE p.status = 'expired'
      AND p.offer_deadline IS NOT NULL
      AND p.visit_confirm_answered_at IS NULL
      AND p.visit_confirm_prompted_at IS NULL
      -- 이벤트 다음날 아침 07:00 KST 지난 건만 (밤이 끝난 뒤)
      AND (p.event_date + INTERVAL '1 day 7 hours') AT TIME ZONE 'Asia/Seoul' <= now()
      AND p.expires_at > now() - INTERVAL '14 days'
      AND EXISTS (SELECT 1 FROM puzzle_offers po WHERE po.puzzle_id = p.id AND po.md_id IS NOT NULL)
    ORDER BY p.expires_at DESC
    LIMIT 500
  LOOP
    PERFORM notify_user_push(
      v_rec.leader_id,
      COALESCE(v_rec.area, '어젯밤') || ' 다녀오셨어요? ⭐',
      '다녀오셨다면 파트너 리뷰를 남겨주세요. 다음 손님과 파트너에게 큰 도움이 돼요!',
      jsonb_build_object('type', 'visit_confirm_prompt', 'puzzle_id', v_rec.id),
      '/',
      'review_request'
    );
    UPDATE puzzles SET visit_confirm_prompted_at = now() WHERE id = v_rec.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION send_visit_confirm_prompts() TO service_role;

-- pg_cron: 매일 13:00 KST (04:00 UTC) — 리뷰요청 cron(14:00)과 겹치지 않게
DO $$
BEGIN
  PERFORM cron.unschedule('visit-confirm-prompts-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'visit-confirm-prompts-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'visit-confirm-prompts-daily',
  '0 4 * * *',
  $$SELECT send_visit_confirm_prompts();$$
);
