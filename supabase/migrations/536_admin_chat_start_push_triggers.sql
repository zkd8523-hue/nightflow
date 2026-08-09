-- ============================================================================
-- Migration 536: 채팅 시작 admin 푸시를 "테이블 트리거"로 분리 (회귀 방지)
-- 날짜: 2026-08-08
--
-- 문제:
--   1) 깃발 1:1 채팅 시작 admin 푸시는 406에서 send_offer_message() 안에
--      인라인으로 넣었는데, 이후 425/442/449가 함수를 CREATE OR REPLACE 하며
--      그 블록이 빠졌다 → 현재(449) 채팅 시작해도 admin 푸시 안 감.
--   2) 조각(파티챗) 상담 시작은 admin 푸시가 애초에 없었다.
--
-- 해결: 함수 인라인이 아니라 "테이블 트리거"로 옮긴다. 함수 재정의와 무관하게
--   살아남는다.
--   - 깃발: puzzle_offers.leader_chat_started_at 가 NULL→값 으로 바뀌는 순간
--     (= 방장이 그 오퍼에 첫 메시지를 보내 채팅 시작) AFTER UPDATE 트리거.
--   - 조각: puzzle_party_md INSERT (= 방장이 오퍼 골라 MD를 파티챗에 초대) AFTER INSERT.
--   딥링크는 notify_admins_push_url(480) 사용 (top-level url 이라야 push-dispatch가 클릭 링크로 씀).
-- ============================================================================

-- ── 깃발: 채팅 시작 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_admin_push_offer_chat_started()
RETURNS TRIGGER AS $fn$
DECLARE
  v_leader_name TEXT;
  v_md_name     TEXT;
  v_club_name   TEXT;
BEGIN
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(name,''), '유저')
    INTO v_leader_name FROM users u JOIN puzzles p ON p.leader_id = u.id WHERE p.id = NEW.puzzle_id;
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(name,''), 'MD')
    INTO v_md_name FROM users WHERE id = NEW.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  PERFORM notify_admins_push_url(
    '💬 채팅이 시작됐어요',
    v_leader_name || ' → ' || v_md_name
      || CASE WHEN v_club_name IS NOT NULL THEN ' · ' || v_club_name ELSE '' END,
    '/messages/' || NEW.id::TEXT,
    jsonb_build_object('type','offer_chat_started','offer_id',NEW.id::TEXT,'puzzle_id',NEW.puzzle_id::TEXT)
  );
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS admin_push_offer_chat_started ON puzzle_offers;
CREATE TRIGGER admin_push_offer_chat_started
  AFTER UPDATE ON puzzle_offers
  FOR EACH ROW
  WHEN (OLD.leader_chat_started_at IS NULL AND NEW.leader_chat_started_at IS NOT NULL)
  EXECUTE FUNCTION trg_admin_push_offer_chat_started();


-- ── 조각: 파티챗 상담 시작(방장이 MD 초대) ──────────────────────────────────
CREATE OR REPLACE FUNCTION trg_admin_push_party_started()
RETURNS TRIGGER AS $fn$
DECLARE
  v_leader_name TEXT;
  v_md_name     TEXT;
  v_club_name   TEXT;
BEGIN
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(name,''), '유저')
    INTO v_leader_name FROM users u JOIN puzzles p ON p.leader_id = u.id WHERE p.id = NEW.puzzle_id;
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(name,''), 'MD')
    INTO v_md_name FROM users WHERE id = NEW.md_id;
  -- 클럽명: 초대 근거 오퍼 → club_id
  SELECT c.name INTO v_club_name
    FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = NEW.offer_id;

  PERFORM notify_admins_push_url(
    '💬 조각 상담이 시작됐어요',
    v_leader_name || ' → ' || v_md_name
      || CASE WHEN v_club_name IS NOT NULL THEN ' · ' || v_club_name ELSE '' END,
    '/party/' || NEW.puzzle_id::TEXT,
    jsonb_build_object('type','party_consult_started','puzzle_id',NEW.puzzle_id::TEXT)
  );
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS admin_push_party_started ON puzzle_party_md;
CREATE TRIGGER admin_push_party_started
  AFTER INSERT ON puzzle_party_md
  FOR EACH ROW
  EXECUTE FUNCTION trg_admin_push_party_started();
