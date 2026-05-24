-- ============================================================================
-- Migration 227: 깃발(퍼즐) 유저 푸시 알림
-- 날짜: 2026-05-24
-- 설명:
--   유저(깃발 방장) 대상 FCM 푸시 2종 추가:
--     1) 오퍼 도착 (puzzle_offers INSERT): MD가 오퍼 보낼 때마다 방장에게 즉시 푸시
--     2) 오퍼 마감 (17:00 KST, open→selecting 전환 시): notify-puzzle-events
--        Edge Function 내부에서 FCM 호출 (이 마이그레이션은 #1만 처리)
--
--   164_admin_push_triggers 패턴 재사용:
--     - pg_net으로 push-dispatch Edge Function 호출 (비동기)
--     - push_tokens 없는 유저는 push-dispatch가 알아서 skip
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 헬퍼: 단일 유저에게 FCM 푸시 발송
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_user_push(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB,
  p_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_url TEXT;
  v_body JSONB;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

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

COMMENT ON FUNCTION notify_user_push(UUID, TEXT, TEXT, JSONB, TEXT)
  IS '단일 유저에게 FCM 푸시 발송 (push-dispatch Edge Function 비동기 호출)';

-- ============================================================================
-- 트리거: 오퍼 도착 → 방장에게 FCM 푸시
-- ============================================================================
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
  -- 방장 + 깃발 상태/식별자 조회 (open/selecting 상태일 때만 푸시 의미 있음)
  SELECT leader_id, status, area, event_date
    INTO v_leader_id, v_puzzle_status, v_puzzle_area, v_puzzle_event_date
  FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_leader_id IS NULL THEN RETURN NEW; END IF;
  IF v_puzzle_status NOT IN ('open', 'selecting') THEN RETURN NEW; END IF;

  -- 깃발 식별자: "홍대 5/25"
  v_flag_label := v_puzzle_area || ' '
                  || EXTRACT(MONTH FROM v_puzzle_event_date)::TEXT || '/'
                  || EXTRACT(DAY FROM v_puzzle_event_date)::TEXT;

  -- 클럽명 조회
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  -- 주류 미리보기: 첫 1개 + 외 N
  v_includes_count := COALESCE(array_length(NEW.includes, 1), 0);
  IF v_includes_count = 1 THEN
    v_drinks := NEW.includes[1];
  ELSIF v_includes_count >= 2 THEN
    v_drinks := NEW.includes[1] || ' 외 ' || (v_includes_count - 1)::TEXT;
  END IF;

  -- 본문: "{깃발식별자} · {클럽명} · {주류}"
  v_body := v_flag_label || ' · ' || COALESCE(v_club_name, '클럽')
            || CASE WHEN v_drinks IS NOT NULL THEN ' · ' || v_drinks ELSE '' END;

  PERFORM notify_user_push(
    v_leader_id,
    '🚩 새 오퍼 도착',
    v_body,
    jsonb_build_object(
      'type', 'puzzle_new_offer',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    ),
    '/flags/' || NEW.puzzle_id::TEXT
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS puzzle_push_new_offer ON puzzle_offers;
CREATE TRIGGER puzzle_push_new_offer
  AFTER INSERT ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_push_new_offer();

COMMENT ON FUNCTION trg_puzzle_push_new_offer()
  IS '오퍼 도착 시 깃발 방장에게 FCM 푸시 (open/selecting 상태일 때만)';
