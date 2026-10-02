-- ============================================================================
-- Migration 681: 외국인 요청 운영자 푸시 — "클럽이 골라주세요" 요청 구분
-- 날짜: 2026-10-02
--
-- 배경:
--   외국인 폼에 "클럽이 골라주세요"(클럽 없이 날짜·예산만) 경로가 생겼다.
--   이 요청은 club_ids가 빈 배열이고 selected_menu.md_recommend.club_pick = true로 들어온다.
--   Migration 455의 본문은 COALESCE(area, '클럽지정')이라, "서울 어디든 + 골라주세요"
--   요청이 정반대인 "클럽지정"으로 찍혔다. 운영자가 /admin/foreign에서 클럽을 먼저
--   지정해야 하는 건이라 제목부터 다르게 보낸다.
--
-- 바뀌는 것: 알림 문구만. notify_admins_push 호출 방식·딥링크·트리거는 455 그대로.
-- 코드 배포와 순서 무관(코드는 이 함수를 읽지 않는다).
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_admins_foreign_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club_pick BOOLEAN :=
    COALESCE(array_length(NEW.club_ids, 1), 0) = 0
    AND COALESCE((NEW.selected_menu -> 'md_recommend' ->> 'club_pick')::boolean, false);
BEGIN
  IF v_club_pick THEN
    PERFORM notify_admins_push(
      '🎯 클럽 지정 필요 · 외국인 요청',
      '클럽 추천 · ' || COALESCE(NEW.area, '지역무관') || ' · ' || NEW.group_size::text || '명 · '
        || to_char(NEW.event_date, 'MM/DD')
        || COALESCE(' · ' || to_char(NEW.budget, 'FM999,999,999') || '원', ''),
      jsonb_build_object('type', 'foreign_request', 'id', NEW.id::text, 'url', '/admin/foreign')
    );
  ELSE
    PERFORM notify_admins_push(
      '🌏 새 외국인 요청',
      COALESCE(NEW.area, '클럽지정') || ' · ' || NEW.group_size::text || '명 · ' || to_char(NEW.event_date, 'MM/DD'),
      jsonb_build_object('type', 'foreign_request', 'id', NEW.id::text, 'url', '/admin/foreign')
    );
  END IF;
  RETURN NEW;
END;
$$;
