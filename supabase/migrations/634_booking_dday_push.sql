-- ============================================================================
-- Migration 634: 예약 당일 오후 3시 운영자 푸시
--
-- 배경: 예약을 잡아놓고 당일에 잊는다. 클럽 오픈(23시) 전에 손님·MD 양쪽을
--      한 번 챙길 시간이 필요한데, 오후 3시면 문제가 생겨도 대응할 여유가 있다.
--
-- Edge Function을 만들지 않고 SQL로 끝낸다 — 조회 후 notify_admins_push만
-- 부르면 되는 일에 함수를 새로 배포하면 배포 대상이 하나 더 늘어난다.
--
-- 참조: 311_fix_notify_admins_push_null_safe.sql(notify_admins_push),
--      580_collect_events_cron_8pm.sql(cron 패턴)
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_admin_today_bookings()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_body TEXT;
BEGIN
  -- 오늘(KST) 방문 예정이고 취소되지 않은 요청
  FOR v_row IN
    SELECT
      fr.id,
      fr.guest_name,
      fr.group_size,
      bc.ref_no,
      bc.total_price,
      bc.confirmed_group_size,
      c.name AS club_name,
      u.display_name AS md_name
    FROM foreign_requests fr
    LEFT JOIN booking_confirmations bc ON bc.request_id = fr.id
    LEFT JOIN clubs c ON c.id = COALESCE(bc.club_id, fr.club_ids[1])
    LEFT JOIN users u ON u.id = fr.assigned_md_id
    WHERE fr.event_date = (now() AT TIME ZONE 'Asia/Seoul')::date
      AND fr.status <> 'cancelled'
    ORDER BY fr.event_date
  LOOP
    v_body :=
      COALESCE(v_row.club_name, '클럽 미정') || ' · ' ||
      COALESCE(v_row.guest_name, '게스트') || ' ' ||
      COALESCE(v_row.confirmed_group_size, v_row.group_size)::text || '명' ||
      CASE WHEN v_row.md_name IS NOT NULL THEN ' · 담당 ' || v_row.md_name
           ELSE ' · ⚠️ 담당 MD 미지정' END;

    PERFORM notify_admins_push(
      '📅 오늘 예약 ' || COALESCE(v_row.ref_no, ''),
      v_body,
      jsonb_build_object('type', 'booking_dday', 'id', v_row.id::text, 'url', '/admin/foreign')
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION notify_admin_today_bookings() IS
  '오늘 방문 예정인 외국인 예약을 운영자에게 푸시. 담당 MD 미지정 건은 경고 표시.';

-- 기존 잡 정리 후 재등록 (중복 스케줄 방지)
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = 'booking-dday-push'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'booking-dday-push',
  '0 6 * * *',  -- 06:00 UTC = 15:00 KST
  $$ SELECT notify_admin_today_bookings(); $$
);
