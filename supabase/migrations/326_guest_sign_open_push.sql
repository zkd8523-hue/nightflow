-- Migration 326: 게스트 간판(주간 슬롯) 오픈 푸시
-- 적용일: 2026-06-17
--
-- 매주 월 18:00 KST(=09:00 UTC), weekly_hotdeal_slots가 오픈될 때
-- 파트너 MD(club_partners 연결) 전원에게 "이번 주 간판이 열렸어요" 푸시.
--
-- 인증: notify_user_push 경유 → Vault(supabase_url/service_role_key) 사용 (Migration 312).
-- 카테고리: 'marketing' (MD가 토글로 끌 수 있음, 방해금지 존중).

CREATE OR REPLACE FUNCTION send_guest_sign_open_push()
RETURNS INTEGER AS $$
DECLARE
  v_md RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_md IN
    SELECT DISTINCT cp.md_id
    FROM club_partners cp
    JOIN users u ON u.id = cp.md_id
    WHERE u.role IN ('md','admin') AND u.deleted_at IS NULL
  LOOP
    PERFORM notify_user_push(
      v_md.md_id,
      '📣 이번 주 간판이 열렸어요!',
      '지금 바로 이번 주를 시작해볼까요?',
      jsonb_build_object('type','guest_sign_open'),
      '/md/dashboard',
      'marketing'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION send_guest_sign_open_push() IS
  'Migration 326: 매주 월 18시 게스트 간판 오픈 시 파트너 MD 전원에게 푸시(marketing).';

-- 매주 월 18:00 KST (09:00 UTC) cron
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'guest-sign-open-push' LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule('guest-sign-open-push', '0 9 * * 1', 'SELECT send_guest_sign_open_push();');
