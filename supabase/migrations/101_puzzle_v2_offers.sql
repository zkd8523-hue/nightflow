-- ============================================================================
-- Migration 101: 퍼즐 V2 — 역경매 오퍼(Offer) 시스템
-- 날짜: 2026-04-15
-- 설명: MD가 퍼즐에 제안서(offer)를 보내고, 방장이 수락하는 역경매 구조
--       기존 unlock_puzzle_contact (크레딧 1개로 카톡 열람) → 오퍼 기반 역경매로 전환
-- ============================================================================

-- ============================================================================
-- 1. puzzles 테이블 변경
-- ============================================================================

-- 예산 모델: 총액 고정 (total_budget)
-- 기존 budget_per_person 유지 (하위 호환, 구버전 데이터)
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS total_budget INTEGER;

-- 퍼즐 상태 확장: 'accepted' 추가
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_status_check;
ALTER TABLE puzzles ADD CONSTRAINT puzzles_status_check
  CHECK (status IN ('open', 'matched', 'cancelled', 'expired', 'accepted'));

-- 수락된 오퍼 참조 (FK는 puzzle_offers 생성 후 추가)
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS accepted_offer_id UUID;

-- ============================================================================
-- 2. users 테이블: MD 크레딧 및 일일 제한 컬럼 추가
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_credits_max INTEGER NOT NULL DEFAULT 120;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_daily_offers_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_daily_offers_reset_at DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS md_active_offers_count INTEGER NOT NULL DEFAULT 0;

-- 유저 일일 참여 제한
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_puzzle_joins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_puzzle_creates INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_counters_reset_at DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_puzzles_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- 3. puzzle_members 테이블: 노쇼 개별 처리 컬럼 추가
-- ============================================================================
ALTER TABLE puzzle_members ADD COLUMN IF NOT EXISTS noshow BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE puzzle_members ADD COLUMN IF NOT EXISTS visited BOOLEAN;

-- ============================================================================
-- 4. puzzle_offers 테이블 신설
-- ============================================================================
CREATE TABLE puzzle_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  md_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

  -- 오퍼 내용 (방장 + 해당 MD만 열람 가능)
  table_type TEXT NOT NULL CHECK (table_type IN ('Standard', 'VIP', 'Premium')),
  proposed_price INTEGER NOT NULL CHECK (proposed_price > 0),
  includes TEXT[] DEFAULT '{}',   -- 포함 내역 (바틀 종류/수량, 믹서, 과일, 서비스 등)
  comment TEXT,                   -- MD 코멘트 (선택)

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(puzzle_id, md_id)  -- 동일 퍼즐에 MD당 1건만
);

CREATE INDEX idx_puzzle_offers_puzzle ON puzzle_offers(puzzle_id);
CREATE INDEX idx_puzzle_offers_md ON puzzle_offers(md_id);
CREATE INDEX idx_puzzle_offers_status ON puzzle_offers(status);

ALTER TABLE puzzle_offers ENABLE ROW LEVEL SECURITY;

-- 기본 정보(클럽명, 테이블타입, 상태)는 누구나 조회
-- 민감 정보(금액, 포함내역, 코멘트)는 프론트에서 방장/해당MD가 아니면 제외
CREATE POLICY "Anyone can view offers" ON puzzle_offers
  FOR SELECT USING (true);

-- MD만 본인 오퍼 생성
CREATE POLICY "MD can create offers" ON puzzle_offers
  FOR INSERT WITH CHECK (
    auth.uid() = md_id
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'md')
  );

-- MD 본인 오퍼 수정/철회, 방장도 상태 변경 가능
CREATE POLICY "MD or leader can update offer" ON puzzle_offers
  FOR UPDATE USING (
    auth.uid() = md_id
    OR EXISTS (
      SELECT 1 FROM puzzles WHERE id = puzzle_id AND leader_id = auth.uid()
    )
  );

-- updated_at 자동 갱신
CREATE TRIGGER puzzle_offers_updated_at
  BEFORE UPDATE ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- puzzles.accepted_offer_id FK (puzzle_offers 생성 후 추가)
ALTER TABLE puzzles ADD CONSTRAINT fk_puzzles_accepted_offer
  FOREIGN KEY (accepted_offer_id) REFERENCES puzzle_offers(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. in_app_notifications 타입 확장
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
    'puzzle_seat_adjusted', 'puzzle_cancelled',
    'puzzle_offer_received', 'puzzle_offer_accepted', 'puzzle_offer_rejected',
    'puzzle_leader_changed'
  ));

-- ============================================================================
-- 6. RPC 함수: submit_offer()
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_offer(
  p_puzzle_id UUID,
  p_club_id UUID,
  p_table_type TEXT,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_md users%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_max_price INTEGER;
  v_base_budget INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  -- 검증
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 퍼즐입니다');
  END IF;
  IF v_md.md_active_offers_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', '동시 활성 오퍼는 최대 3건입니다');
  END IF;

  -- 일일 발송 캡 확인 (날짜가 바뀌면 리셋)
  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;
  IF v_md.md_daily_offers_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '일일 제안 횟수(6건)를 초과했습니다');
  END IF;

  -- 업셀 +30% 제한
  v_base_budget := COALESCE(
    v_puzzle.total_budget,
    v_puzzle.budget_per_person * v_puzzle.target_count
  );
  v_max_price := CEIL(v_base_budget * 1.3);
  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산의 130%%를 초과할 수 없습니다 (최대 %s원)', v_max_price)
    );
  END IF;

  -- 중복 제안 확인
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 퍼즐입니다');
  END IF;

  -- 오퍼 생성
  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- MD 카운터 증가
  UPDATE users SET
    md_active_offers_count = md_active_offers_count + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  -- 방장에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 퍼즐에 제안서를 보냈습니다. 확인해보세요!'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. RPC 함수: accept_offer()
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_md users%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;

  -- 검증
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  IF v_md.md_credits < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD의 크레딧이 부족합니다');
  END IF;

  -- 오퍼 수락
  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 나머지 pending 오퍼 expired 처리
  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  -- 탈락 MD들 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  -- 탈락 MD들에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  -- 퍼즐 상태 변경
  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 + 슬롯 감소
  UPDATE users SET
    md_credits = md_credits - 30,
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  -- 수락된 MD에게 알림 + 방장 카카오 링크 반환
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. RPC 함수: reject_offer()
-- ============================================================================
CREATE OR REPLACE FUNCTION reject_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM puzzles WHERE id = v_offer.puzzle_id AND leader_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'rejected', updated_at = now()
  WHERE id = p_offer_id;

  -- MD 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = v_offer.md_id;

  -- MD에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (v_offer.md_id, 'puzzle_offer_rejected', '제안 거절됨', '방장이 제안을 거절했습니다. 슬롯이 회복되었습니다.');

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. RPC 함수: withdraw_offer()
-- ============================================================================
CREATE OR REPLACE FUNCTION withdraw_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF v_offer.md_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '권한이 없습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE id = p_offer_id;

  -- 슬롯 회복
  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. 오퍼 존재 시 퍼즐 예산/인원 수정 잠금 트리거 (Bug 2 fix)
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_puzzle_edit_with_offers()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (OLD.total_budget IS DISTINCT FROM NEW.total_budget
      OR OLD.budget_per_person IS DISTINCT FROM NEW.budget_per_person
      OR OLD.target_count IS DISTINCT FROM NEW.target_count)
    AND EXISTS (
      SELECT 1 FROM puzzle_offers
      WHERE puzzle_id = NEW.id AND status = 'pending'
    )
  ) THEN
    RAISE EXCEPTION '제안이 접수된 퍼즐의 예산/인원은 수정할 수 없습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_puzzle_edit_lock
  BEFORE UPDATE ON puzzles
  FOR EACH ROW EXECUTE FUNCTION prevent_puzzle_edit_with_offers();

-- ============================================================================
-- 11. MD 크레딧 일일 충전 함수 (Bug 1 fix: 충전과 카운터 초기화 분리)
-- ============================================================================
CREATE OR REPLACE FUNCTION recharge_md_credits()
RETURNS void AS $$
BEGIN
  -- 1) 일일 카운터 초기화 (크레딧 잔액과 무관하게 모든 MD 대상)
  UPDATE users
  SET
    md_daily_offers_count = 0,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE role = 'md';

  -- 2) 크레딧 충전 (상한 미만인 MD만)
  UPDATE users
  SET md_credits = LEAST(md_credits + 60, md_credits_max)
  WHERE role = 'md' AND md_credits < md_credits_max;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. leave_puzzle() 재정의: 방장 이탈 시 자동 위임 (Bug 3 fix)
-- ============================================================================
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;

  -- 내 멤버 기록 확인
  SELECT guest_count INTO v_guest FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  -- 탈퇴 처리
  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET
    current_count = current_count - (1 + COALESCE(v_guest, 0))
  WHERE id = p_puzzle_id;

  -- 방장이 나가는 경우: 다음 참여자에게 위임
  IF v_puzzle.leader_id = auth.uid() THEN
    -- 참여 순서(joined_at)로 다음 조각원 선택
    SELECT user_id INTO v_next_leader
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      -- 다음 참여자에게 방장 위임
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;

      -- 새 방장에게 알림
      INSERT INTO in_app_notifications (user_id, type, title, message)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 퍼즐을 떠나 회원님이 새 방장이 되었습니다. MD 제안을 확인해보세요!'
      );
    ELSE
      -- 남은 참여자 없음 → 퍼즐 취소
      UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

      -- pending 오퍼들 만료 처리 + MD 슬롯 회복
      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
      WHERE puzzle_id = p_puzzle_id AND status = 'pending';

      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id IN (
        SELECT md_id FROM puzzle_offers
        WHERE puzzle_id = p_puzzle_id AND status = 'expired'
          AND updated_at > now() - INTERVAL '1 second'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 13. cancel_puzzle() 재정의: 취소 시 오퍼 슬롯 회복
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM puzzles WHERE id = p_puzzle_id AND leader_id = auth.uid()
  ) THEN
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

  -- pending 오퍼 만료 + MD 슬롯 회복
  UPDATE puzzle_offers SET status = 'expired', updated_at = now()
  WHERE puzzle_id = p_puzzle_id AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
