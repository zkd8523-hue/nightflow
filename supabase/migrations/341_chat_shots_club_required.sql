-- Migration 341: 와글 LIVE — chat_shots에 club_id 필수화
-- 목적: SHOT 자체를 폐기하고 LIVE 단일 정체성으로 통합
--   - 새 INSERT는 club_id 필수 (NOT NULL은 트리거로 검증 — 기존 row 안전)
--   - 한 작성자 30분에 클럽 SHOT 1개 + 일일 7개 한도 (도배·어뷰징·리워드 게이팅)
--   - club_id의 area와 작성자 GPS 인증 area 일치 강제
--   - 클럽 담당 MD(clubs.md_id)가 본인 클럽 LIVE 삭제 가능

-- ============================================
-- 1) club_id 컬럼 추가
-- ============================================
ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

-- 인덱스: 클럽 페이지에서 그 클럽 활성 LIVE 빠른 조회
CREATE INDEX IF NOT EXISTS idx_chat_shots_club_active
  ON chat_shots(club_id, created_at DESC)
  WHERE club_id IS NOT NULL AND is_test = FALSE AND is_hidden IS NOT TRUE;

-- ============================================
-- 2) 작성 시 club_id 필수 + 도배·어뷰징·area 일치 트리거
-- ============================================
-- 기존 row(club_id IS NULL인 historical SHOT)는 그대로 두고
-- 새 INSERT부터 club_id 필수 + 정책 강제
CREATE OR REPLACE FUNCTION enforce_live_post_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_area TEXT;
  v_author_area TEXT;
  v_recent_count INT;
BEGIN
  -- 1) club_id 필수 (LIVE 단일 정체성)
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'LIVE_CLUB_REQUIRED: 라이브는 클럽을 지정해야 올릴 수 있어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2) club.area와 작성자 author_area 일치 (위치 어뷰징 차단)
  SELECT area INTO v_club_area FROM clubs WHERE id = NEW.club_id;
  IF v_club_area IS NULL THEN
    RAISE EXCEPTION 'LIVE_INVALID_CLUB: 선택한 클럽을 찾을 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- club.area는 한글("강남"/"홍대"/"이태원") vs author_area는 코드(gangnam/...)
  -- 매핑 검증
  v_author_area := NEW.author_area;
  IF NOT (
    (v_club_area = '강남'   AND v_author_area = 'gangnam') OR
    (v_club_area = '홍대'   AND v_author_area = 'hongdae') OR
    (v_club_area = '이태원' AND v_author_area = 'itaewon')
  ) THEN
    RAISE EXCEPTION 'LIVE_AREA_MISMATCH: 인증된 지역과 클럽 지역이 달라요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) 30분 락: 한 작성자가 30분에 클럽 SHOT 1개 (어느 클럽이든)
  IF EXISTS (
    SELECT 1 FROM chat_shots
    WHERE author_id = NEW.author_id
      AND club_id IS NOT NULL
      AND created_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'LIVE_LOCKED_30MIN: 30분 후에 다시 올릴 수 있어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4) 일일 한도: 한 작성자 24h에 클럽 SHOT 최대 7개
  SELECT COUNT(*) INTO v_recent_count
    FROM chat_shots
    WHERE author_id = NEW.author_id
      AND club_id IS NOT NULL
      AND created_at > now() - interval '24 hours';
  IF v_recent_count >= 7 THEN
    RAISE EXCEPTION 'LIVE_DAILY_LIMIT: 하루에 라이브 7개까지 올릴 수 있어요'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_live_post_rules ON chat_shots;
CREATE TRIGGER trg_enforce_live_post_rules
  BEFORE INSERT ON chat_shots
  FOR EACH ROW EXECUTE FUNCTION enforce_live_post_rules();

-- ============================================
-- 3) 삭제 권한 확장 — 클럽 담당 MD도 본인 클럽 라이브 삭제 가능
-- ============================================
DROP POLICY IF EXISTS "Author or admin can delete shots" ON chat_shots;
DROP POLICY IF EXISTS "Author or admin or club_md can delete shots" ON chat_shots;
CREATE POLICY "Author or admin or club_md can delete shots"
  ON chat_shots
  FOR DELETE USING (
    auth.uid() = author_id
    OR public.is_admin()
    OR (
      club_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM clubs c
        WHERE c.id = chat_shots.club_id
          AND c.md_id = auth.uid()
      )
    )
  );

-- ============================================
-- 4) is_hidden 컬럼 추가 (초상권 신고 1건 즉시 비공개용)
-- ============================================
ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- 활성 SHOT 조회 정책 갱신 — is_hidden=FALSE 추가
DROP POLICY IF EXISTS "Anyone can read active shots" ON chat_shots;
CREATE POLICY "Anyone can read active shots"
  ON chat_shots
  FOR SELECT USING (
    expires_at > now()
    AND is_hidden = FALSE
  );

COMMENT ON COLUMN chat_shots.club_id IS
  'Migration 341: LIVE 단일 정체성. 새 INSERT부터 NOT NULL 강제 (트리거). 기존 historical row는 NULL 가능.';
COMMENT ON COLUMN chat_shots.is_hidden IS
  'Migration 341: 초상권 신고 1건 또는 일반 신고 5건 누적 시 자동 숨김.';
COMMENT ON FUNCTION enforce_live_post_rules() IS
  'LIVE 작성 강제: club_id 필수 + area 일치 + 30분 락 + 일일 7개 한도.';
