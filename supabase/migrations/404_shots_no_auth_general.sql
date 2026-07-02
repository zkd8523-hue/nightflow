-- Migration 404: SHOT 인증 완화 (일반 SHOT은 인증 없이 게시)
--   - area NULL 허용 (잡담 SHOT)
--   - area/club_id 없으면 인증 불필요
--   - 신고 카테고리 privacy_face 추가 + 1건 즉시 비공개 트리거

-- ============================================
-- 1) chat_shots.area NULL 허용
-- ============================================
ALTER TABLE chat_shots
  DROP CONSTRAINT IF EXISTS chat_shots_area_check;

ALTER TABLE chat_shots
  ALTER COLUMN area DROP NOT NULL;

ALTER TABLE chat_shots
  ADD CONSTRAINT chat_shots_area_check
    CHECK (area IS NULL OR area IN ('gangnam', 'hongdae', 'itaewon'));

-- ============================================
-- 2) INSERT 정책 완화 — area/club_id 없으면 인증 불필요
-- ============================================
DROP POLICY IF EXISTS "Verified users can post shots" ON chat_shots;
DROP POLICY IF EXISTS "Anyone can post general shots" ON chat_shots;
CREATE POLICY "Anyone can post general shots"
  ON chat_shots
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
    AND (
      -- 일반 SHOT: 인증 불필요
      (area IS NULL AND club_id IS NULL)
      OR
      -- 지역방 SHOT 또는 LIVE: 인증 필요
      (area IS NOT NULL AND public.has_active_area_verification(auth.uid(), area))
    )
  );

-- ============================================
-- 3) 신고 카테고리 privacy_face 추가 + 1건 즉시 비공개
-- ============================================
ALTER TABLE chat_shot_reports
  DROP CONSTRAINT IF EXISTS chat_shot_reports_reason_check;

ALTER TABLE chat_shot_reports
  ADD CONSTRAINT chat_shot_reports_reason_check
    CHECK (reason IN ('spam', 'abuse', 'sexual', 'advertising', 'fake_location', 'privacy_face', 'other'));

-- 트리거: privacy_face 신고 1건 즉시 chat_shots.is_hidden=true
CREATE OR REPLACE FUNCTION hide_shot_on_privacy_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reason = 'privacy_face' THEN
    UPDATE chat_shots
      SET is_hidden = TRUE
      WHERE id = NEW.shot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hide_shot_on_privacy_report ON chat_shot_reports;
CREATE TRIGGER trg_hide_shot_on_privacy_report
  AFTER INSERT ON chat_shot_reports
  FOR EACH ROW EXECUTE FUNCTION hide_shot_on_privacy_report();

COMMENT ON POLICY "Anyone can post general shots" ON chat_shots IS
  'Migration 404: 일반 SHOT(area NULL, club_id NULL)은 인증 불필요. 지역방 SHOT/LIVE는 인증 필요.';
COMMENT ON FUNCTION hide_shot_on_privacy_report() IS
  'Migration 404: 초상권(privacy_face) 신고 1건 즉시 SHOT 비공개.';
