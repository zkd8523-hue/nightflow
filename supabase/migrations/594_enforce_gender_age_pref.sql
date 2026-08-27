-- ============================================================================
-- Migration 594: 성별 제한 실제 강제 + 연령 제한을 범위(min_age/max_age)로 신설
-- 날짜: 2026-08-28
-- 배경:
--   puzzles.gender_pref/age_pref는 지금까지 상세 페이지의 태그 표시용일 뿐,
--   join_puzzle()은 이 값을 전혀 확인하지 않아 "성별/연령 선호"를 걸어둬도
--   실제로는 아무나 참가할 수 있었다.
--
--   등록 폼 문구를 "선호"에서 "파티원 선별"로 단호하게 바꾸면서(PuzzleForm.tsx),
--   실제로도 막아야 앞뒤가 맞는다.
--
--   연령은 처음엔 기존 age_pref(20대/30대 버킷)를 그대로 강제할 계획이었으나,
--   버킷 대신 실제 범위(예: 20~35세)로 직접 입력받기로 방향을 바꿨다. 그래서
--   age_pref 컬럼은 건드리지 않고(과거 파티의 레거시 표시용으로만 남김),
--   새 min_age/max_age 컬럼을 신설해 이번 참가 제한은 이 두 컬럼으로만 판정한다.
--
--   548 본문 그대로 + 성별 체크·연령 범위 체크 블록 삽입.
-- ============================================================================

ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS max_age INTEGER;
ALTER TABLE puzzles ADD CONSTRAINT check_min_max_age
  CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age);

CREATE OR REPLACE FUNCTION join_puzzle(p_puzzle_id UUID, p_guest_count INTEGER DEFAULT 0)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_total INTEGER;
  v_u users%ROWTYPE;
  v_user_name TEXT;
  v_age INTEGER;
BEGIN
  v_total := 1 + GREATEST(p_guest_count, 0);
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  SELECT * INTO v_u FROM users WHERE id = auth.uid();

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '파티를 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 파티입니다');
  END IF;
  IF v_puzzle.current_count + v_total > v_puzzle.target_count THEN
    RETURN jsonb_build_object('success', false, 'error', '남은 자리가 부족합니다');
  END IF;
  IF v_puzzle.leader_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '본인이 만든 파티입니다');
  END IF;
  IF EXISTS (SELECT 1 FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 참여한 파티입니다');
  END IF;
  -- 추방 이력 → 재합류 차단
  IF EXISTS (SELECT 1 FROM puzzle_kicks WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 파티에서 내보내져 다시 합류할 수 없어요');
  END IF;

  -- ⭐ 성별 제한 (Migration 594) — 표시용이던 gender_pref를 실제 차단으로
  IF v_puzzle.gender_pref = 'male_only' AND v_u.gender IS DISTINCT FROM 'male' THEN
    RETURN jsonb_build_object('success', false, 'error', '이 파티는 남자만 참가할 수 있어요');
  END IF;
  IF v_puzzle.gender_pref = 'female_only' AND v_u.gender IS DISTINCT FROM 'female' THEN
    RETURN jsonb_build_object('success', false, 'error', '이 파티는 여자만 참가할 수 있어요');
  END IF;

  -- ⭐ 연령 제한 (Migration 594) — min_age/max_age 범위. 둘 다 NULL이면 제한 없음.
  -- birthday 미입력이면 범위 판정이 불가능하므로 안전하게 차단한다.
  IF v_puzzle.min_age IS NOT NULL OR v_puzzle.max_age IS NOT NULL THEN
    IF v_u.birthday IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '생년월일 정보가 없어 연령 제한 파티에 참가할 수 없어요. 프로필에서 생년월일을 등록해주세요');
    END IF;
    v_age := EXTRACT(YEAR FROM age(v_u.birthday))::INTEGER;
    IF v_puzzle.min_age IS NOT NULL AND v_age < v_puzzle.min_age THEN
      RETURN jsonb_build_object('success', false, 'error', v_puzzle.min_age || '세 이상만 참가할 수 있는 파티예요');
    END IF;
    IF v_puzzle.max_age IS NOT NULL AND v_age > v_puzzle.max_age THEN
      RETURN jsonb_build_object('success', false, 'error', v_puzzle.max_age || '세 이하만 참가할 수 있는 파티예요');
    END IF;
  END IF;

  INSERT INTO puzzle_members (puzzle_id, user_id, guest_count)
    VALUES (p_puzzle_id, auth.uid(), GREATEST(p_guest_count, 0));
  UPDATE puzzles SET current_count = current_count + v_total WHERE id = p_puzzle_id;

  -- 닉네임 우선 (Migration 548) — 다른 파티 함수와 동일한 폴백 순서
  v_user_name := COALESCE(NULLIF(v_u.display_name, ''), NULLIF(v_u.name, ''), '회원');

  -- 단체채팅 시스템 메시지 + 합류자 본인 읽음 초기화
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 합류했어요', TRUE);
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
    VALUES (p_puzzle_id, auth.uid(), now())
    ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_member_joined',
    '새로운 참여자!',
    v_user_name || '님이 파티에 참여했습니다. 인원을 확인해보세요!',
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true, 'current_count', v_puzzle.current_count + v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
