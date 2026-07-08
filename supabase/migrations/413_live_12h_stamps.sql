-- Migration 413: LIVE 12h 휘발 + 스탬프 리워드 시스템
--
-- 정책 변경:
--   1) chat_shots 휘발 시간 9h → 12h (신규 게시)
--   2) 스탬프 시스템: club_id 지정 LIVE 게시 시 +1
--      - 지역(area) 인증 필요 + club.area == 인증 area (Migration 341 트리거로 이미 강제)
--      - 30분 락 (마지막 스탬프로부터 30분 경과)
--      - 24h 내 7개까지 (일 한도)
--      - 조건 미충족 시 게시는 허용, 스탬프만 미적립
--   3) MD 삭제 시 작성자에게 알림 (notifications 테이블 활용)
--
-- 참고:
--   - Migration 341에서 이미 club_id, is_hidden, area 일치 트리거, MD 삭제 RLS 구축됨
--   - Migration 341의 일일 7개 한도는 "게시 자체" 차단 → 본 마이그레이션에서 삭제하고
--     "스탬프 적립"에만 한도 적용 (게시는 자유)

-- ============================================
-- 1) chat_shots.expires_at 기본값 12h로 상향
-- ============================================
ALTER TABLE chat_shots
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '12 hours');

COMMENT ON COLUMN chat_shots.expires_at IS
  'Migration 413: 만료 시각. INSERT 시 created_at + 12h로 자동 설정. 만료된 row는 RLS SELECT에서 제외 + cron 정리.';

-- ============================================
-- 2) Migration 341 트리거 재정의 — 게시 자유화
--    (area 일치는 유지, 일일 7개 게시 차단은 제거 → 스탬프 조건으로 이동)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_live_post_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_area TEXT;
  v_author_area TEXT;
BEGIN
  -- club_id 미지정 = 일반 SHOT — 아무 규칙 적용 X
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- club_id 지정된 LIVE: area 일치만 강제 (위치 어뷰징 차단)
  SELECT area INTO v_club_area FROM clubs WHERE id = NEW.club_id;
  IF v_club_area IS NULL THEN
    RAISE EXCEPTION 'LIVE_INVALID_CLUB: 선택한 클럽을 찾을 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- chat_shots의 작성자 인증 지역 컬럼은 area (author_area 아님 — Migration 419에서 교정)
  v_author_area := NEW.area;
  IF NOT (
    (v_club_area = '강남'   AND v_author_area = 'gangnam') OR
    (v_club_area = '홍대'   AND v_author_area = 'hongdae') OR
    (v_club_area = '이태원' AND v_author_area = 'itaewon')
  ) THEN
    RAISE EXCEPTION 'LIVE_AREA_MISMATCH: 인증된 지역과 클럽 지역이 달라요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 일일 게시 한도 제거됨 → 스탬프 적립 조건으로 이동 (하단 earn_stamp_on_live)
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_live_post_rules() IS
  'Migration 413: club_id 지정 시 area 일치만 강제. 게시 한도는 제거되고 스탬프 조건으로 이동.';

-- ============================================
-- 3) 스탬프 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS user_stamps (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_count INT NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  total_earned INT NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  last_earned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_stamps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User can read own stamps" ON user_stamps;
CREATE POLICY "User can read own stamps"
  ON user_stamps
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE는 SECURITY DEFINER 함수/트리거로만 (직접 조작 차단)

COMMENT ON TABLE user_stamps IS
  'Migration 413: 유저별 스탬프 잔량/누적. LIVE(club_id 지정) 게시 시 트리거로 적립.';

-- ============================================
-- 4) 스탬프 이력 (감사/디버깅용)
-- ============================================
CREATE TABLE IF NOT EXISTS stamp_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('live_with_club', 'redeem', 'admin_grant', 'admin_revoke')),
  related_shot_id UUID REFERENCES chat_shots(id) ON DELETE SET NULL,
  related_redemption_id UUID, -- 카탈로그 마이그레이션에서 FK 추가 예정
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stamp_history_user
  ON stamp_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stamp_history_user_reason_recent
  ON stamp_history(user_id, reason, created_at DESC)
  WHERE reason = 'live_with_club';

ALTER TABLE stamp_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User can read own stamp history" ON stamp_history;
CREATE POLICY "User can read own stamp history"
  ON stamp_history
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE stamp_history IS
  'Migration 413: 스탬프 적립/차감 이력. 30분 락 계산 + 통계 + 감사 용도.';

-- ============================================
-- 5) 스탬프 적립 트리거 (LIVE 게시 시)
--    조건: club_id 지정 + is_test=false + 30분 락 통과 + 일 7개 미만
--    조건 미충족 시 게시는 허용, 스탬프만 미적립
-- ============================================
CREATE OR REPLACE FUNCTION earn_stamp_on_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_earned_at TIMESTAMPTZ;
  v_daily_count INT;
BEGIN
  -- 클럽 지정 안 됨 또는 테스트 데이터 → 스탬프 없음
  IF NEW.club_id IS NULL OR NEW.is_test = TRUE THEN
    RETURN NEW;
  END IF;

  -- 30분 락: 마지막 'live_with_club' 스탬프 30분 이내면 skip
  SELECT MAX(created_at) INTO v_last_earned_at
    FROM stamp_history
    WHERE user_id = NEW.author_id
      AND reason = 'live_with_club';

  IF v_last_earned_at IS NOT NULL
     AND v_last_earned_at > now() - interval '30 minutes' THEN
    RETURN NEW;
  END IF;

  -- 일 7개 락
  SELECT COUNT(*) INTO v_daily_count
    FROM stamp_history
    WHERE user_id = NEW.author_id
      AND reason = 'live_with_club'
      AND created_at > now() - interval '24 hours';

  IF v_daily_count >= 7 THEN
    RETURN NEW;
  END IF;

  -- 조건 통과 → 스탬프 +1
  INSERT INTO user_stamps (user_id, current_count, total_earned, last_earned_at, updated_at)
    VALUES (NEW.author_id, 1, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      current_count = user_stamps.current_count + 1,
      total_earned = user_stamps.total_earned + 1,
      last_earned_at = now(),
      updated_at = now();

  INSERT INTO stamp_history (user_id, delta, reason, related_shot_id)
    VALUES (NEW.author_id, 1, 'live_with_club', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_earn_stamp_on_live ON chat_shots;
CREATE TRIGGER trg_earn_stamp_on_live
  AFTER INSERT ON chat_shots
  FOR EACH ROW EXECUTE FUNCTION earn_stamp_on_live();

COMMENT ON FUNCTION earn_stamp_on_live() IS
  'Migration 413: LIVE 게시 후 스탬프 적립. 조건: club_id 지정 + 실사용자 + 30분 락 + 일 7개.';

-- ============================================
-- 6) 스탬프 상태 조회 헬퍼 뷰 (클라이언트용 — 잔량/누적/다음 적립 가능 시간)
-- ============================================
CREATE OR REPLACE VIEW my_stamp_status AS
SELECT
  s.user_id,
  s.current_count,
  s.total_earned,
  s.last_earned_at,
  -- 30분 락 남은 시간
  CASE
    WHEN s.last_earned_at IS NULL THEN NULL
    WHEN s.last_earned_at + interval '30 minutes' <= now() THEN NULL
    ELSE s.last_earned_at + interval '30 minutes'
  END AS next_eligible_at,
  -- 오늘 적립한 스탬프 수 (24h 롤링)
  (
    SELECT COUNT(*)
    FROM stamp_history h
    WHERE h.user_id = s.user_id
      AND h.reason = 'live_with_club'
      AND h.created_at > now() - interval '24 hours'
  ) AS earned_last_24h
FROM user_stamps s
WHERE s.user_id = auth.uid();

GRANT SELECT ON my_stamp_status TO authenticated;

COMMENT ON VIEW my_stamp_status IS
  'Migration 413: 현재 로그인 유저의 스탬프 현황 (auth.uid() 기반).';

-- ============================================
-- 7) MD/Admin이 다른 사람 LIVE 삭제 시 작성자에게 알림
-- ============================================
CREATE OR REPLACE FUNCTION notify_author_on_live_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_club_name TEXT;
BEGIN
  -- 본인이 본인 것 삭제하는 건 알림 없음
  IF v_actor IS NULL OR v_actor = OLD.author_id THEN
    RETURN OLD;
  END IF;

  -- 클럽 지정된 LIVE만 알림 대상
  IF OLD.club_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT name INTO v_club_name FROM clubs WHERE id = OLD.club_id;

  -- 카테고리 'system' — 시스템 알림 (토글 있음)
  PERFORM notify_user_push(
    OLD.author_id,
    '라이브가 삭제되었어요',
    COALESCE(v_club_name, '클럽') || ' 담당자 또는 관리자가 회원님의 라이브를 삭제했어요',
    jsonb_build_object('type', 'live_deleted', 'shot_id', OLD.id::TEXT),
    '/chat',
    'system'
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_author_on_live_delete ON chat_shots;
CREATE TRIGGER trg_notify_author_on_live_delete
  BEFORE DELETE ON chat_shots
  FOR EACH ROW EXECUTE FUNCTION notify_author_on_live_delete();

COMMENT ON FUNCTION notify_author_on_live_delete() IS
  'Migration 413: MD/Admin이 다른 유저 LIVE 삭제 시 작성자에게 시스템 알림.';
