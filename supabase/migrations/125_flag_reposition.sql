-- ============================================================================
-- Migration 125: 퍼즐 → 깃발 리포지셔닝 — 역경매 메인, 파티원 모집 옵션화
-- 날짜: 2026-04-24
-- 설명: 기존 퍼즐 플로우는 "인원 부족자 조각모음"을 전제로 설계되었으나,
--       유저 대부분은 이미 인원이 확정된 상태에서 예산/지역을 걸고 MD 제안을
--       받고 싶어한다. is_recruiting_party 플래그로 두 모드를 분리한다.
--
--       - false (기본): 인원 확정 깃발. target_count = current_count, join 차단.
--       - true        : 파티원 추가 모집. 기존 조각모음 플로우 유지.
--
--       DB/테이블명/라우트는 그대로(puzzles). UI 표기만 "깃발"로 리브랜딩.
-- ============================================================================

-- ============================================================================
-- 1. is_recruiting_party 컬럼 추가
-- ============================================================================
ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS is_recruiting_party BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. 기존 데이터 백필
--    과거 퍼즐은 사실상 100% 조각모음 목적이었음. status와 무관하게
--    target_count > current_count였던 모든 레코드를 true로 백필.
--    이유: '내 기록'/'참여 이력' 조회 시 과거 조각모음 글이 "인원 확정"으로
--    잘못 표기되는 걸 방지 (히스토리 정확성).
-- ============================================================================
UPDATE puzzles
SET is_recruiting_party = true
WHERE target_count > current_count;

-- ============================================================================
-- 3. target_count = current_count 불변 조건 (파티 모집 OFF일 때)
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_party_toggle_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.is_recruiting_party AND NEW.target_count <> NEW.current_count THEN
    RAISE EXCEPTION '파티원 모집 OFF 깃발은 target_count와 current_count가 같아야 합니다 (target=%, current=%)',
      NEW.target_count, NEW.current_count;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_party_toggle_invariant ON puzzles;
CREATE TRIGGER check_party_toggle_invariant
  BEFORE INSERT OR UPDATE ON puzzles
  FOR EACH ROW EXECUTE FUNCTION enforce_party_toggle_invariant();

-- ============================================================================
-- 4. 오퍼 접수 시 is_recruiting_party 변경 잠금
--    기존 prevent_puzzle_edit_with_offers 트리거에 플래그 변경도 포함.
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_puzzle_edit_with_offers()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (OLD.total_budget IS DISTINCT FROM NEW.total_budget
      OR OLD.budget_per_person IS DISTINCT FROM NEW.budget_per_person
      OR OLD.target_count IS DISTINCT FROM NEW.target_count
      OR OLD.is_recruiting_party IS DISTINCT FROM NEW.is_recruiting_party)
    AND EXISTS (
      SELECT 1 FROM puzzle_offers
      WHERE puzzle_id = NEW.id AND status = 'pending'
    )
  ) THEN
    RAISE EXCEPTION '제안이 접수된 깃발의 예산/인원/모집방식은 수정할 수 없습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. join_puzzle 재정의 — 파티원 모집 OFF 깃발 참여 차단
--    기존 097 버전에 가드 1개 추가, 나머지 로직 동일.
-- ============================================================================
CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);

  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  -- NEW: 파티원 모집 OFF 깃발은 참여 차단 (인원 확정 깃발)
  IF NOT v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '이 깃발은 파티원을 모집하지 않습니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 깃발입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 깃발입니다');
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
