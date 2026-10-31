-- ============================================================================
-- Migration 703: 클럽 대표 담당자 + 요청 자동 지정 (2026-11-01)
--
-- 요청(외국인·한국)이 들어오면 그 클럽의 대표 담당자에게 자동으로 지정하고 제안서를 보낸다.
-- 예산·날짜 조건은 두지 않는다(사용자 결정 — 안 되는 건 담당자가 "받기 어려워요"로 거절).
-- 대표 담당자가 없는 클럽은 지금처럼 운영자가 직접 지정한다.
--
-- 흐름: INSERT 트리거 → net.http_post → /api/auto-assign(Vercel)이 지정 + notifyAssignedMd.
--   중복 요청(같은 연락처·날짜·클럽, 24시간 이내)과 발송 실패는 라우트가 걸러 운영자에게 넘긴다.
-- 인증은 다른 cron과 같은 vault의 service_role_key.
--
-- 초기 지정(사용자 지정): Club Ace = 우현, DM SEOUL = 강한별.
-- ⚠️ 라우트 배포 전에 적용해도 된다 — 그 사이 트리거 호출은 404로 끝나고 요청 저장엔 영향 없음.
-- 끄려면: UPDATE clubs SET representative_md_id = NULL WHERE ...;
-- ============================================================================

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS representative_md_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE clubs SET representative_md_id = '55023300-3024-4da3-a27f-37c698eeb23a'
 WHERE id = '35de296e-5fdc-435b-baf2-1c7c05538687'; -- Club Ace · 레이스&사운드 우현 (에이스)
UPDATE clubs SET representative_md_id = 'f487373d-a7b5-407f-aba2-7a39a1ba6751'
 WHERE id = 'cc7db051-b75d-4c1f-9f95-29f7d8ce70d7'; -- DM SEOUL · 강한별

CREATE OR REPLACE FUNCTION auto_assign_request_md()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key TEXT;
  v_club UUID;
  v_type TEXT := CASE WHEN TG_TABLE_NAME = 'korean_booking_requests' THEN 'korean' ELSE 'foreign' END;
BEGIN
  IF NEW.assigned_md_id IS NOT NULL THEN RETURN NEW; END IF;
  v_club := CASE WHEN v_type = 'korean' THEN (to_jsonb(NEW) ->> 'club_id')::UUID
                 ELSE (to_jsonb(NEW) -> 'club_ids' ->> 0)::UUID END;
  -- 대표 담당자가 있는 클럽만 부른다 — 나머지는 라우트까지 갈 이유가 없다.
  IF v_club IS NULL OR NOT EXISTS (SELECT 1 FROM clubs WHERE id = v_club AND representative_md_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    PERFORM net.http_post(
      url := 'https://nightflow.kr/api/auto-assign',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || COALESCE(v_key, '')),
      body := jsonb_build_object('request_type', v_type, 'request_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_assign_request_md failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foreign_request_auto_assign ON foreign_requests;
CREATE TRIGGER foreign_request_auto_assign
  AFTER INSERT ON foreign_requests
  FOR EACH ROW EXECUTE FUNCTION auto_assign_request_md();

DROP TRIGGER IF EXISTS korean_booking_auto_assign ON korean_booking_requests;
CREATE TRIGGER korean_booking_auto_assign
  AFTER INSERT ON korean_booking_requests
  FOR EACH ROW EXECUTE FUNCTION auto_assign_request_md();
