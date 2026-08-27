-- ============================================================================
-- Migration 603: 공연 댓글 수정 + 신고
-- 날짜: 2026-08-28
-- 설명:
--   602에서 댓글에 답글·좋아요를 붙였는데 정작 오타를 고칠 방법이 없었다.
--   338(오퍼 메시지 수정)과 같은 방식 — RLS UPDATE 정책을 여는 대신 RPC로 막는다.
--
--   왜 RLS UPDATE 정책이 아니라 RPC인가
--     UPDATE를 열면 클라이언트가 어느 컬럼이든 바꿀 수 있다. like_count·reply_count는
--     트리거가 관리하는 값이라 손대면 카운트가 깨지고, is_deleted를 직접 만지면
--     reply_count 동기화 트리거가 예상 못 한 순서로 돈다.
--     RPC는 content만 갈아끼우므로 그 문이 아예 없다.
--
--   신고는 322(와글 SHOT 신고)와 같은 모양이다.
--   admin 삭제는 이미 된다 — 602의 DELETE 정책에 is_admin()이 들어 있어
--   테이블 작업은 필요 없고 UI만 열면 된다.
-- ============================================================================

ALTER TABLE event_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN event_comments.edited_at IS
  '마지막 수정 시각. NULL이면 원본 그대로 (UI에서 "수정됨" 표시 기준).';

CREATE OR REPLACE FUNCTION edit_event_comment(p_comment_id UUID, p_content TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row event_comments;
BEGIN
  SELECT * INTO v_row FROM event_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '댓글을 찾을 수 없어요');
  END IF;
  IF v_row.author_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', '본인 댓글만 수정할 수 있어요');
  END IF;
  IF v_row.is_deleted THEN
    RETURN json_build_object('success', false, 'error', '삭제된 댓글이에요');
  END IF;
  IF char_length(COALESCE(p_content, '')) > 300 THEN
    RETURN json_build_object('success', false, 'error', '300자를 넘을 수 없어요');
  END IF;
  -- 사진만 있는 댓글은 본문을 비울 수 있다(event_comments_not_empty와 같은 기준).
  -- 사진도 본문도 없으면 빈 댓글이 되므로 막는다.
  IF char_length(trim(COALESCE(p_content, ''))) = 0
     AND jsonb_array_length(v_row.media) = 0 THEN
    RETURN json_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;

  UPDATE event_comments
     SET content = trim(COALESCE(p_content, '')), edited_at = now()
   WHERE id = p_comment_id;

  RETURN json_build_object('success', true);
END; $$;

GRANT EXECUTE ON FUNCTION edit_event_comment(UUID, TEXT) TO authenticated;


-- ============================================================================
-- 신고 — 322(chat_shot_reports)와 같은 구조
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_comment_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES event_comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL
    CHECK (reason IN ('spam', 'abuse', 'sexual', 'advertising', 'other')),
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note  TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 한 사람이 같은 댓글을 여러 번 신고해 큐를 부풀리지 못하게 한다
  UNIQUE (comment_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_event_comment_reports_pending
  ON event_comment_reports(status, created_at DESC) WHERE status = 'pending';

ALTER TABLE event_comment_reports ENABLE ROW LEVEL SECURITY;

-- 자기 댓글은 신고할 수 없다(322와 동일)
DROP POLICY IF EXISTS "Login users can report event comments" ON event_comment_reports;
CREATE POLICY "Login users can report event comments"
  ON event_comment_reports FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = reporter_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM event_comments
      WHERE id = comment_id AND author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "View own + admin event comment reports" ON event_comment_reports;
CREATE POLICY "View own + admin event comment reports"
  ON event_comment_reports FOR SELECT USING (
    auth.uid() = reporter_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can update event comment reports" ON event_comment_reports;
CREATE POLICY "Admin can update event comment reports"
  ON event_comment_reports FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE event_comment_reports IS
  '공연 댓글 신고. status=pending → Admin이 resolved/rejected 처리.';
