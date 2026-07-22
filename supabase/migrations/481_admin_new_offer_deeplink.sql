-- ============================================================================
-- Migration 481: 신규 오퍼 admin 푸시 → 깃발 상세 딥링크 + MD 닉네임 노출
-- 날짜: 2026-07-21
--
-- 문제 1: trg_admin_push_new_offer(164)가 notify_admins_push(url 미포함)를 써서
--         알림을 눌러도 홈으로만 이동, 해당 오퍼가 온 상세로 못 감.
-- 문제 2: 본문의 MD 표기가 users.name(실명) 기준 → 닉네임(display_name)이 안 보임.
--
-- 해결: notify_admins_push_url(480)로 교체해 top-level url 을 실어 보내고
--       (push-dispatch가 이 url 로 클릭 딥링크를 건다), url 은 /flags/{puzzle_id}.
--       MD 표기는 COALESCE(display_name, name)로 닉네임 우선.
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
  -- 닉네임(display_name) 우선, 없으면 실명(name)
  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), 'MD')
    INTO v_md_name FROM users WHERE id = NEW.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  v_includes_count := COALESCE(array_length(NEW.includes, 1), 0);
  IF v_includes_count = 1 THEN
    v_drinks := NEW.includes[1];
  ELSIF v_includes_count >= 2 THEN
    v_drinks := NEW.includes[1] || ' 외 ' || (v_includes_count - 1)::TEXT;
  END IF;

  -- 본문: 클럽명 · MD닉네임 · 오퍼옵션1 외 N
  v_body := COALESCE(v_club_name, '클럽') || ' · ' || v_md_name
            || CASE WHEN v_drinks IS NOT NULL THEN ' · ' || v_drinks ELSE '' END;

  -- notify_admins_push_url(480): top-level url 포함 → 클릭 시 깃발 상세로 딥링크
  PERFORM notify_admins_push_url(
    '💌 신규 오퍼가 도착했어요!',
    v_body,
    '/flags/' || NEW.puzzle_id::TEXT,
    jsonb_build_object(
      'type', 'new_offer',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재생성 불필요(함수 본문만 CREATE OR REPLACE) — admin_push_new_offer 그대로 유지.
