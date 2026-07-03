-- ============================================================================
-- Migration 230: 알림 카테고리 토글 + 방해금지 시간대
-- 날짜: 2026-05-24
-- 설명:
--   /settings/notifications 페이지에서 사용자가 카테고리별로 푸시 알림을
--   끄고 켤 수 있도록 users 테이블에 컬럼 추가.
--
--   카테고리 구조 (역할별):
--     - 유저:   notify_offer_arrived (오퍼 도착)
--     - MD:     notify_new_puzzle (새 깃발, 지역 마스터 스위치)
--               notify_offer_response (오퍼 응답: 수락/거절)
--     - 공통:   notify_marketing (마케팅·이벤트)
--
--   방해금지 시간대 (푸시 only):
--     - quiet_hours_enabled: ON/OFF
--     - quiet_hours_start / quiet_hours_end: 0-23 (시 단위)
--     - end > start: 같은 날 (예: 9~18)
--     - end < start: 자정 넘김 (예: 22~8)
--
--   거래·법적 통지 (낙찰, 노쇼, 매치 확정 등)는 토글 없음 = 항상 발송.
--   알림톡 consent OFF여도 거래·법적 통지는 발송됨 (별도 강제 로직 필요).
--
--   호환성:
--     - 모든 토글 기본값 TRUE → 기존 사용자는 변경 없음
--     - quiet_hours_enabled 기본 FALSE → 영향 없음
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_offer_arrived BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_new_puzzle BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_offer_response BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_marketing BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT,
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT;

ALTER TABLE users
  ADD CONSTRAINT chk_quiet_hours_start_range
    CHECK (quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23));
ALTER TABLE users
  ADD CONSTRAINT chk_quiet_hours_end_range
    CHECK (quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23));

COMMENT ON COLUMN users.notify_offer_arrived IS '유저 푸시: 내 깃발에 오퍼 도착';
COMMENT ON COLUMN users.notify_new_puzzle IS 'MD 푸시: 구독 지역 새 깃발 (지역 마스터 스위치)';
COMMENT ON COLUMN users.notify_offer_response IS 'MD 푸시: 내가 보낸 오퍼에 유저 응답';
COMMENT ON COLUMN users.notify_marketing IS '공통 푸시: 마케팅·이벤트';
COMMENT ON COLUMN users.quiet_hours_enabled IS '방해금지 시간대 ON/OFF (푸시 only)';
COMMENT ON COLUMN users.quiet_hours_start IS '방해금지 시작 시각 (0-23, KST)';
COMMENT ON COLUMN users.quiet_hours_end IS '방해금지 종료 시각 (0-23, KST)';

-- ============================================================================
-- 헬퍼 함수: 현재 시각이 사용자의 방해금지 시간대인지 확인
-- ============================================================================
CREATE OR REPLACE FUNCTION is_in_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_start SMALLINT;
  v_end SMALLINT;
  v_now_hour SMALLINT;
BEGIN
  SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end
    INTO v_enabled, v_start, v_end
    FROM users
    WHERE id = p_user_id;

  IF NOT COALESCE(v_enabled, FALSE) OR v_start IS NULL OR v_end IS NULL THEN
    RETURN FALSE;
  END IF;

  -- KST 기준 현재 시각
  v_now_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Seoul'))::SMALLINT;

  -- 같은 날 범위 (예: 9~18)
  IF v_end > v_start THEN
    RETURN v_now_hour >= v_start AND v_now_hour < v_end;
  END IF;

  -- 자정 넘김 (예: 22~8)
  IF v_end < v_start THEN
    RETURN v_now_hour >= v_start OR v_now_hour < v_end;
  END IF;

  -- start == end → 의미 없음, 비활성으로 간주
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION is_in_quiet_hours(UUID)
  IS '사용자의 방해금지 시간대 진입 여부 (KST 기준)';

-- ============================================================================
-- 헬퍼 함수: 카테고리별 푸시 발송 허용 여부
--   - quiet hours 진입 중이면 거부
--   - 카테고리 토글 OFF면 거부
--   - 그 외 허용
--
--   p_category: 'offer_arrived' | 'new_puzzle' | 'offer_response' | 'marketing'
-- ============================================================================
CREATE OR REPLACE FUNCTION can_send_push(p_user_id UUID, p_category TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF is_in_quiet_hours(p_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT CASE p_category
    WHEN 'offer_arrived'  THEN notify_offer_arrived
    WHEN 'new_puzzle'     THEN notify_new_puzzle
    WHEN 'offer_response' THEN notify_offer_response
    WHEN 'marketing'      THEN notify_marketing
    ELSE TRUE  -- 거래·법적 등 미정의 카테고리 = 항상 허용
  END
    INTO v_allowed
    FROM users
    WHERE id = p_user_id;

  RETURN COALESCE(v_allowed, TRUE);
END;
$$;

COMMENT ON FUNCTION can_send_push(UUID, TEXT)
  IS '카테고리별 푸시 발송 허용 여부 (방해금지 + 토글 종합 판단)';

-- ============================================================================
-- notify_user_push() 확장: 카테고리 인자 추가 + can_send_push 체크
--
-- Migration 227에서 정의된 함수를 OVERLOAD해서 카테고리 인자 받는 버전 추가.
-- 기존 5-arg 시그니처는 그대로 유지 (호환성) → 거래·법적 통지는 그대로 호출.
-- 새 6-arg 시그니처는 카테고리 인자로 토글/방해금지 체크 후 발송.
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_user_push(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB,
  p_url TEXT,
  p_category TEXT
)
RETURNS VOID AS $$
DECLARE
  v_url TEXT;
  v_body JSONB;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- 카테고리 토글 + 방해금지 체크
  IF NOT can_send_push(p_user_id, p_category) THEN
    RETURN;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/push-dispatch';

  v_body := jsonb_build_object(
    'user_id', p_user_id::TEXT,
    'title', p_title,
    'body', p_body,
    'data', p_data
  );
  IF p_url IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('url', p_url);
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := v_body
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_user_push(UUID, TEXT, TEXT, JSONB, TEXT, TEXT)
  IS '카테고리 체크 후 단일 유저에게 FCM 푸시 (토글 OFF/방해금지 진입 시 skip)';

-- ============================================================================
-- 기존 트리거 업데이트: 카테고리 인자 명시
-- ============================================================================

-- 유저: 오퍼 도착 (Migration 227)
CREATE OR REPLACE FUNCTION trg_puzzle_push_new_offer()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_id UUID;
  v_puzzle_status TEXT;
  v_puzzle_area TEXT;
  v_puzzle_event_date DATE;
  v_flag_label TEXT;
  v_club_name TEXT;
  v_drinks TEXT;
  v_includes_count INTEGER;
  v_body TEXT;
BEGIN
  SELECT leader_id, status, area, event_date
    INTO v_leader_id, v_puzzle_status, v_puzzle_area, v_puzzle_event_date
  FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_leader_id IS NULL THEN RETURN NEW; END IF;
  IF v_puzzle_status NOT IN ('open', 'selecting') THEN RETURN NEW; END IF;

  v_flag_label := v_puzzle_area || ' '
                  || EXTRACT(MONTH FROM v_puzzle_event_date)::TEXT || '/'
                  || EXTRACT(DAY FROM v_puzzle_event_date)::TEXT;

  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  v_includes_count := COALESCE(array_length(NEW.includes, 1), 0);
  IF v_includes_count = 1 THEN
    v_drinks := NEW.includes[1];
  ELSIF v_includes_count >= 2 THEN
    v_drinks := NEW.includes[1] || ' 외 ' || (v_includes_count - 1)::TEXT;
  END IF;

  v_body := v_flag_label || ' · ' || COALESCE(v_club_name, '클럽')
            || CASE WHEN v_drinks IS NOT NULL THEN ' · ' || v_drinks ELSE '' END;

  PERFORM notify_user_push(
    v_leader_id,
    '💌 새 오퍼가 도착했어요!',
    v_body,
    jsonb_build_object(
      'type', 'puzzle_new_offer',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    ),
    '/flags/' || NEW.puzzle_id::TEXT,
    'offer_arrived'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- MD: 새 깃발 (Migration 228)
-- 깃발/조각 분기: is_recruiting_party=true 면 조각(🧩), 아니면 깃발(🚩). 수신자 로직 동일.
CREATE OR REPLACE FUNCTION trg_puzzle_push_md_area_match()
RETURNS TRIGGER AS $$
DECLARE
  v_md RECORD;
  v_seoul_areas TEXT[] := ARRAY['강남', '홍대', '이태원', '건대'];
  v_title TEXT; v_body TEXT; v_type TEXT;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_recruiting_party, false) THEN
    v_title := '🧩 새 조각이 올라왔어요!';
    v_body  := NEW.area || ' ' || EXTRACT(MONTH FROM NEW.event_date)::TEXT || '/' || EXTRACT(DAY FROM NEW.event_date)::TEXT
               || ' | ' || NEW.target_count::TEXT || '인 | 인당 ' || to_char(COALESCE(NEW.budget_per_person,0),'FM999,999,999') || '원';
    v_type  := 'new_share';
  ELSE
    v_title := '🚩 새 깃발이 꽂혔어요!';
    v_body  := format('%s · %s명 · 총 %s원', NEW.area, NEW.target_count,
                 to_char(COALESCE(NEW.total_budget, NEW.budget_per_person * NEW.target_count),'FM999,999,999'));
    v_type  := 'puzzle_new_in_area';
  END IF;

  IF NEW.area = '서울 어디든' THEN
    FOR v_md IN
      SELECT DISTINCT md_id FROM md_puzzle_area_subs
      WHERE area = ANY(v_seoul_areas) AND md_id <> NEW.leader_id
    LOOP
      PERFORM notify_user_push(v_md.md_id, v_title, v_body,
        jsonb_build_object('type',v_type,'puzzle_id',NEW.id::TEXT,'area',NEW.area),
        '/flags/' || NEW.id::TEXT, 'new_puzzle');
    END LOOP;
  ELSE
    FOR v_md IN
      SELECT md_id FROM md_puzzle_area_subs
      WHERE area = NEW.area AND md_id <> NEW.leader_id
    LOOP
      PERFORM notify_user_push(v_md.md_id, v_title, v_body,
        jsonb_build_object('type',v_type,'puzzle_id',NEW.id::TEXT,'area',NEW.area),
        '/flags/' || NEW.id::TEXT, 'new_puzzle');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- MD: 오퍼 수락 (Migration 229)
CREATE OR REPLACE FUNCTION trg_puzzle_push_offer_accepted()
RETURNS TRIGGER AS $$
DECLARE
  v_puzzle RECORD;
  v_club_name TEXT;
  v_flag_label TEXT;
  v_price_text TEXT;
  v_body TEXT;
BEGIN
  IF NOT (OLD.status = 'pending' AND NEW.status = 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT area, event_date, target_count INTO v_puzzle
  FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_puzzle IS NULL THEN RETURN NEW; END IF;

  v_flag_label := v_puzzle.area || ' '
                  || EXTRACT(MONTH FROM v_puzzle.event_date)::TEXT || '/'
                  || EXTRACT(DAY FROM v_puzzle.event_date)::TEXT;

  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  IF NEW.proposed_price % 10000 = 0 THEN
    v_price_text := (NEW.proposed_price / 10000)::TEXT || '만원';
  ELSE
    v_price_text := to_char(NEW.proposed_price, 'FM999,999,999') || '원';
  END IF;

  v_body := v_flag_label || ' · ' || COALESCE(v_club_name, '클럽')
            || ' · ' || v_price_text
            || ' · ' || v_puzzle.target_count::TEXT || '명';

  PERFORM notify_user_push(
    NEW.md_id,
    '🎉 오퍼가 수락됐어요!',
    v_body,
    jsonb_build_object(
      'type', 'puzzle_offer_accepted',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    ),
    '/flags/' || NEW.puzzle_id::TEXT,
    'offer_response'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
