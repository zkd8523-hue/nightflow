-- 어드민 푸시 알림 트리거
-- 4가지 이벤트 발생 시 모든 어드민(users.role='admin')에게 FCM 푸시 발송
--   1. 신규 깃발 (puzzles INSERT)
--   2. 신규 오퍼 (puzzle_offers INSERT)
--   3. 오퍼 승락 (puzzle_offers.status → accepted)
--   4. MD 신청 (users.md_status → pending)
--
-- pg_net + push-dispatch Edge Function 연동
-- Migration 012(send-approval-sms)와 동일 패턴

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 핵심 헬퍼: 모든 어드민에게 푸시 발송
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_admins_push(
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
DECLARE
  v_admin RECORD;
  v_url TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/push-dispatch';

  FOR v_admin IN
    SELECT id FROM users
    WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'user_id', v_admin.id::TEXT,
        'title', p_title,
        'body', p_body,
        'data', p_data
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_admins_push(TEXT, TEXT, JSONB)
  IS '어드민 role 보유 유저 전체에게 FCM 푸시 발송 (pg_net 비동기)';

-- ============================================================================
-- 트리거 1: 신규 깃발
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_admin_push_new_puzzle()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM notify_admins_push(
    '🚩 새 깃발이 꽂혔어요!',
    format('%s · %s명 · 총 %s원',
      NEW.area,
      NEW.target_count,
      to_char(
        COALESCE(NEW.total_budget, NEW.budget_per_person * NEW.target_count),
        'FM999,999,999'
      )
    ),
    jsonb_build_object(
      'type', 'new_puzzle',
      'puzzle_id', NEW.id::TEXT
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_push_new_puzzle ON puzzles;
CREATE TRIGGER admin_push_new_puzzle
  AFTER INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION trg_admin_push_new_puzzle();

-- ============================================================================
-- 트리거 2: 신규 오퍼
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_admin_push_new_offer()
RETURNS TRIGGER AS $$
DECLARE
  v_md_name TEXT;
  v_club_name TEXT;
  v_includes_count INTEGER;
  v_drinks TEXT;
  v_body TEXT;
BEGIN
  SELECT name INTO v_md_name FROM users WHERE id = NEW.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  v_includes_count := COALESCE(array_length(NEW.includes, 1), 0);
  IF v_includes_count = 1 THEN
    v_drinks := NEW.includes[1];
  ELSIF v_includes_count >= 2 THEN
    v_drinks := NEW.includes[1] || ' 외 ' || (v_includes_count - 1)::TEXT;
  END IF;

  -- 본문: 클럽명 · MD명 · 오퍼옵션1 외 N
  v_body := COALESCE(v_club_name, '클럽') || ' · ' || COALESCE(v_md_name, 'MD')
            || CASE WHEN v_drinks IS NOT NULL THEN ' · ' || v_drinks ELSE '' END;

  PERFORM notify_admins_push(
    '💌 신규 오퍼가 도착했어요!',
    v_body,
    jsonb_build_object(
      'type', 'new_offer',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_push_new_offer ON puzzle_offers;
CREATE TRIGGER admin_push_new_offer
  AFTER INSERT ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION trg_admin_push_new_offer();

-- ============================================================================
-- 트리거 3: 오퍼 승락
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_admin_push_offer_accepted()
RETURNS TRIGGER AS $$
DECLARE
  v_md_name TEXT;
  v_club_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM 'accepted' AND NEW.status = 'accepted' THEN
    SELECT name INTO v_md_name FROM users WHERE id = NEW.md_id;
    SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

    PERFORM notify_admins_push(
      '✅ 오퍼가 매칭됐어요!',
      format('%s · %s · %s원 매칭',
        COALESCE(v_md_name, 'MD'),
        COALESCE(v_club_name, '클럽'),
        to_char(NEW.proposed_price, 'FM999,999,999')
      ),
      jsonb_build_object(
        'type', 'offer_accepted',
        'puzzle_id', NEW.puzzle_id::TEXT,
        'offer_id', NEW.id::TEXT
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_push_offer_accepted ON puzzle_offers;
CREATE TRIGGER admin_push_offer_accepted
  AFTER UPDATE OF status ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION trg_admin_push_offer_accepted();

-- ============================================================================
-- 트리거 4: MD 신청
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_admin_push_md_application()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.md_status IS DISTINCT FROM 'pending' AND NEW.md_status = 'pending' THEN
    PERFORM notify_admins_push(
      '🙋 새 MD가 신청했어요!',
      format('%s님이 MD 신청', COALESCE(NEW.name, '익명')),
      jsonb_build_object(
        'type', 'md_application',
        'user_id', NEW.id::TEXT
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_push_md_application ON users;
CREATE TRIGGER admin_push_md_application
  AFTER UPDATE OF md_status ON users
  FOR EACH ROW EXECUTE FUNCTION trg_admin_push_md_application();
