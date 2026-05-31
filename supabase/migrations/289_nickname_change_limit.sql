-- 289_nickname_change_limit.sql
-- 닉네임(display_name) 변경 횟수 제한
-- 정책: 인스타그램 "이름" 변경 정책과 동일 — 14일에 최대 2회
--   (사칭/신원 세탁 어뷰징 방지)
-- 참고: https://socialbee.com/blog/how-to-change-your-name-on-instagram/

-- 1. 닉네임 변경 이력 테이블
CREATE TABLE IF NOT EXISTS display_name_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_name TEXT,
  new_name TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dn_history_user_time
  ON display_name_history(user_id, changed_at DESC);

ALTER TABLE display_name_history ENABLE ROW LEVEL SECURITY;

-- 본인 이력만 조회 가능 (변경은 아래 SECURITY DEFINER 함수로만)
DROP POLICY IF EXISTS "User can read own name history" ON display_name_history;
CREATE POLICY "User can read own name history" ON display_name_history
  FOR SELECT USING (auth.uid() = user_id);

-- 2. 닉네임 변경 RPC (제한 검증 + 중복 체크 + 변경 + 이력 기록을 원자적으로 처리)
--    14일 윈도우 내 변경 횟수가 2회 이상이면 거부.
CREATE OR REPLACE FUNCTION change_display_name(p_new_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_trimmed TEXT;
  v_current TEXT;
  v_window_count INT;
  v_oldest_in_window TIMESTAMPTZ;
  v_max_changes CONSTANT INT := 2;          -- 14일당 최대 2회
  v_window CONSTANT INTERVAL := INTERVAL '14 days';
  v_next_available TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', '인증이 필요합니다.');
  END IF;

  v_trimmed := btrim(p_new_name);

  -- 길이 검증
  IF char_length(v_trimmed) < 2 OR char_length(v_trimmed) > 16 THEN
    RETURN json_build_object('success', false, 'error', '닉네임은 2~16자로 입력해주세요.');
  END IF;

  -- 현재 닉네임 잠금 조회
  SELECT display_name INTO v_current
  FROM users WHERE id = v_uid
  FOR UPDATE;

  -- 변경이 없으면 그대로 성공 처리 (횟수 차감 X)
  IF v_current = v_trimmed THEN
    RETURN json_build_object('success', true, 'unchanged', true);
  END IF;

  -- 중복 체크 (다른 유저가 사용 중) — display_name UNIQUE 인덱스가 LOWER() 기준이므로 동일하게 비교
  IF EXISTS (
    SELECT 1 FROM users
    WHERE LOWER(display_name) = LOWER(v_trimmed) AND id <> v_uid
  ) THEN
    RETURN json_build_object('success', false, 'error', '이미 사용 중인 닉네임입니다.');
  END IF;

  -- 14일 윈도우 내 변경 횟수
  SELECT COUNT(*), MIN(changed_at)
  INTO v_window_count, v_oldest_in_window
  FROM display_name_history
  WHERE user_id = v_uid
    AND changed_at > now() - v_window;

  IF v_window_count >= v_max_changes THEN
    -- 가장 오래된 변경 + 14일 후에 다시 가능
    v_next_available := v_oldest_in_window + v_window;
    RETURN json_build_object(
      'success', false,
      'error', '닉네임은 14일에 최대 2번까지 변경할 수 있어요.',
      'limit_reached', true,
      'next_available_at', v_next_available
    );
  END IF;

  -- 변경 + 이력 기록
  UPDATE users SET display_name = v_trimmed WHERE id = v_uid;

  INSERT INTO display_name_history (user_id, old_name, new_name)
  VALUES (v_uid, v_current, v_trimmed);

  RETURN json_build_object(
    'success', true,
    'remaining', v_max_changes - (v_window_count + 1)
  );
EXCEPTION
  -- 동시성: 두 유저가 같은 닉네임으로 동시에 변경 시도 (LOWER() UNIQUE 인덱스 위반)
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', '이미 사용 중인 닉네임입니다.');
END;
$$;

-- 인증된 유저가 RPC 호출 가능
GRANT EXECUTE ON FUNCTION change_display_name(TEXT) TO authenticated;
