-- ============================================================================
-- Migration 097: 퍼즐(Puzzle) 기능 — 수요 주도 그룹 모집
-- 날짜: 2026-04-14
-- 설명: puzzles, puzzle_members, puzzle_contact_unlocks, puzzle_reports 테이블
--       + 관련 RPC 함수 + users.md_credits 컬럼 추가
-- ============================================================================

-- ============================================================================
-- 1. users 테이블에 md_credits 컬럼 추가
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS md_credits INTEGER NOT NULL DEFAULT 0
  CHECK (md_credits >= 0);

-- ============================================================================
-- 2. puzzles 테이블
-- ============================================================================
CREATE TABLE puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN ('강남','홍대','이태원','건대','부산','대구','인천','광주','대전','울산','세종')),
  event_date DATE NOT NULL,
  kakao_open_chat_url TEXT NOT NULL CHECK (kakao_open_chat_url LIKE 'https://open.kakao.com/%'),
  -- 취향 태그 (자기선택 유도용, hard filter 아님)
  gender_pref TEXT CHECK (gender_pref IN ('male_only', 'female_only', 'any')) DEFAULT 'any',
  age_pref TEXT CHECK (age_pref IN ('early_20s', 'late_20s', '30s', 'any')) DEFAULT 'any',
  vibe_pref TEXT CHECK (vibe_pref IN ('chill', 'active', 'any')) DEFAULT 'any',
  budget_per_person INTEGER NOT NULL CHECK (budget_per_person >= 10000),
  target_count INTEGER NOT NULL CHECK (target_count BETWEEN 2 AND 20),
  current_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'matched', 'cancelled', 'expired')),
  -- matched: 대표자가 수동으로 [마감] 버튼 → 홈에서 숨김, 추가 MD 크레딧 차단
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_puzzles_area_status ON puzzles(area, status);
CREATE INDEX idx_puzzles_event_date ON puzzles(event_date);
CREATE INDEX idx_puzzles_leader ON puzzles(leader_id);

ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;

-- INSERT/UPDATE 정책은 puzzle_members 참조 안 하므로 먼저 생성
CREATE POLICY "Users can create puzzles" ON puzzles
  FOR INSERT WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Leader can update own puzzle" ON puzzles
  FOR UPDATE USING (auth.uid() = leader_id);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER puzzles_updated_at
  BEFORE UPDATE ON puzzles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. puzzle_members 테이블 (puzzles SELECT 정책보다 먼저 생성해야 함)
-- ============================================================================
CREATE TABLE puzzle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_count INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(puzzle_id, user_id)
);

CREATE INDEX idx_puzzle_members_puzzle ON puzzle_members(puzzle_id);
CREATE INDEX idx_puzzle_members_user ON puzzle_members(user_id);

ALTER TABLE puzzle_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view members" ON puzzle_members
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own membership" ON puzzle_members
  FOR ALL USING (auth.uid() = user_id);

-- puzzles SELECT 정책 (puzzle_members 참조하므로 여기서 생성)
CREATE POLICY "View puzzles" ON puzzles
  FOR SELECT USING (
    status = 'open'
    OR leader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM puzzle_members
      WHERE puzzle_id = puzzles.id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. puzzle_contact_unlocks 테이블 (MD 오픈채팅 열람 기록)
-- ============================================================================
CREATE TABLE puzzle_contact_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_used INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(puzzle_id, md_id)  -- 동일 퍼즐 중복 결제 방지
);

CREATE INDEX idx_puzzle_unlocks_puzzle ON puzzle_contact_unlocks(puzzle_id);
CREATE INDEX idx_puzzle_unlocks_md ON puzzle_contact_unlocks(md_id);

ALTER TABLE puzzle_contact_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MD and leader can view unlocks" ON puzzle_contact_unlocks
  FOR SELECT USING (
    md_id = auth.uid()
    OR EXISTS (SELECT 1 FROM puzzles WHERE id = puzzle_id AND leader_id = auth.uid())
  );

CREATE POLICY "MD can unlock contact" ON puzzle_contact_unlocks
  FOR INSERT WITH CHECK (
    auth.uid() = md_id
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'md')
  );

-- ============================================================================
-- 5. puzzle_reports 테이블 (허위 매물 신고)
-- ============================================================================
CREATE TABLE puzzle_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  reporter_md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(puzzle_id, reporter_md_id)
);

ALTER TABLE puzzle_reports ENABLE ROW LEVEL SECURITY;

-- 열람한 MD만 신고 가능 (크레딧 결제 검증)
CREATE POLICY "MD can report unlocked puzzles" ON puzzle_reports
  FOR INSERT WITH CHECK (
    auth.uid() = reporter_md_id AND
    EXISTS (
      SELECT 1 FROM puzzle_contact_unlocks
      WHERE puzzle_id = puzzle_reports.puzzle_id AND md_id = auth.uid()
    )
  );

CREATE POLICY "Admin can view reports" ON puzzle_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 6. in_app_notifications 타입 추가
-- ============================================================================
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (
    'md_approved', 'md_rejected', 'outbid', 'auction_won',
    'contact_deadline_warning', 'noshow_penalty', 'fallback_won',
    'feedback_request', 'md_grade_change', 'cancellation_confirmed',
    'contact_expired_no_fault', 'contact_expired_user_attempted',
    'md_winner_cancelled', 'md_winner_noshow', 'md_new_bid',
    'md_noshow_review', 'noshow_dismissed',
    'puzzle_seat_adjusted', 'puzzle_cancelled'
  ));

-- ============================================================================
-- 7. RPC 함수
-- ============================================================================

-- 7-1. join_puzzle: 퍼즐 참여 (동행 포함)
CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 퍼즐입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 퍼즐입니다');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-2. leave_puzzle: 퍼즐 탈퇴 (참여자 전용)
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '대표자는 탈퇴 대신 퍼즐을 취소해주세요');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET current_count = current_count - (1 + COALESCE(v_guest, 0))
    WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-3. cancel_puzzle: 대표자 퍼즐 취소
CREATE OR REPLACE FUNCTION cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 퍼즐입니다');
  END IF;

  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 참여자 전원 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
    SELECT user_id, 'puzzle_cancelled', '퍼즐 취소', '참여하신 퍼즐이 취소되었습니다.'
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id != auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-4. match_puzzle: 대표자 수동 마감 (MD와 예약 완료 시)
CREATE OR REPLACE FUNCTION match_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF (SELECT status FROM puzzles WHERE id = p_puzzle_id) != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 종료된 퍼즐입니다');
  END IF;

  UPDATE puzzles SET status = 'matched' WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-5. remove_puzzle_member: 대표자가 참여자 제거 (자리 조정)
CREATE OR REPLACE FUNCTION remove_puzzle_member(p_puzzle_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE v_guest INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자를 찾을 수 없습니다');
  END IF;

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = p_user_id;
  UPDATE puzzles SET current_count = current_count - (1 + COALESCE(v_guest, 0))
    WHERE id = p_puzzle_id;

  INSERT INTO in_app_notifications (user_id, type, title, message)
    VALUES (p_user_id, 'puzzle_seat_adjusted', '자리 조정 안내',
            '참여하신 퍼즐의 자리가 조정되었습니다.');

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-6. unlock_puzzle_contact: MD 오픈채팅 URL 열람 (크레딧 차감)
CREATE OR REPLACE FUNCTION unlock_puzzle_contact(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_md users%ROWTYPE;
  v_cost INTEGER := 1;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '종료되었거나 마감된 퍼즐입니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 열람할 수 있습니다');
  END IF;
  IF v_md.md_credits < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다');
  END IF;

  -- 이미 열람한 경우 중복 차감 없이 URL 반환
  IF EXISTS (SELECT 1 FROM puzzle_contact_unlocks WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid()) THEN
    RETURN jsonb_build_object(
      'success', true,
      'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
      'already_unlocked', true
    );
  END IF;

  UPDATE users SET md_credits = md_credits - v_cost WHERE id = auth.uid();
  INSERT INTO puzzle_contact_unlocks (puzzle_id, md_id, credits_used)
    VALUES (p_puzzle_id, auth.uid(), v_cost);

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'already_unlocked', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7-7. refund_puzzle_unlocks: 어드민 허위 매물 환불 처리
CREATE OR REPLACE FUNCTION refund_puzzle_unlocks(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;

  -- 해당 퍼즐 unlock한 모든 MD에게 크레딧 환불
  UPDATE users SET md_credits = md_credits + pcu.credits_used
    FROM puzzle_contact_unlocks pcu
    WHERE users.id = pcu.md_id AND pcu.puzzle_id = p_puzzle_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 퍼즐 취소
  UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

  -- 허위 매물 게시 유저 차단
  UPDATE users SET is_blocked = true
    WHERE id = (SELECT leader_id FROM puzzles WHERE id = p_puzzle_id);

  RETURN jsonb_build_object('success', true, 'refunded_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
