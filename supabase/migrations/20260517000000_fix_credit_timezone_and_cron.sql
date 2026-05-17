-- ============================================================================
-- Migration 193: 크레딧 자동 충전 KST 타임존 픽스 및 pg_cron 통합
-- ============================================================================
-- 1. submit_offer(), recharge_md_credits() 의 CURRENT_DATE를 KST 기준으로 변경
-- 2. 외부 Edge Function 의존성을 제거하고 DB 내부 pg_cron을 이용해 매일 06:00 KST 충전 실행
-- ============================================================================

-- 1) recharge_md_credits() 수정: KST 적용
CREATE OR REPLACE FUNCTION recharge_md_credits()
RETURNS void AS $$
BEGIN
  -- 일일 카운터 초기화 (KST 기준)
  UPDATE users
  SET
    md_daily_offers_count = 0,
    md_daily_offers_reset_at = (now() AT TIME ZONE 'Asia/Seoul')::DATE
  WHERE role = 'md';

  -- 크레딧 충전 (상한 미만인 MD만)
  UPDATE users
  SET md_credits = LEAST(md_credits + 60, md_credits_max)
  WHERE role = 'md' AND md_credits < md_credits_max;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) submit_offer() 수정: KST 적용
CREATE OR REPLACE FUNCTION submit_offer(
  p_puzzle_id UUID,
  p_club_id UUID,
  p_table_type TEXT,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_md users%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_max_price INTEGER;
  v_base_budget INTEGER;
  v_kst_today DATE;
BEGIN
  v_kst_today := (now() AT TIME ZONE 'Asia/Seoul')::DATE;

  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  -- 검증
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '퍼즐을 찾을 수 없습니다');
  END IF;
  IF v_md.role != 'md' THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD만 제안할 수 있습니다');
  END IF;
  IF v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 퍼즐입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 퍼즐입니다');
  END IF;
  IF v_md.md_active_offers_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', '동시 활성 오퍼는 최대 3건입니다');
  END IF;

  -- 일일 발송 캡 확인 (KST 날짜가 바뀌면 리셋)
  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM v_kst_today THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = v_kst_today
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;
  IF v_md.md_daily_offers_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '일일 제안 횟수(6건)를 초과했습니다');
  END IF;

  -- 업셀 +30% 제한
  v_base_budget := COALESCE(
    v_puzzle.total_budget,
    v_puzzle.budget_per_person * v_puzzle.target_count
  );
  v_max_price := CEIL(v_base_budget * 1.3);
  IF p_proposed_price > v_max_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('예산의 130%%를 초과할 수 없습니다 (최대 %s원)', v_max_price)
    );
  END IF;

  -- 중복 제안 확인
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 퍼즐입니다');
  END IF;

  -- 오퍼 생성
  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- MD 카운터 증가
  UPDATE users SET
    md_active_offers_count = md_active_offers_count + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = v_kst_today
  WHERE id = auth.uid();

  -- 방장에게 알림
  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 퍼즐에 제안서를 보냈습니다. 확인해보세요!'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) pg_cron을 이용해 매일 아침 06:00 KST (21:00 UTC) 에 스케줄 등록
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 만약 기존에 등록된 크론잡이 있다면 덮어쓰거나 무시될 수 있으므로, 명시적으로 unschedule 후 schedule
DO $$
BEGIN
  PERFORM cron.unschedule('recharge-md-credits-daily');
EXCEPTION WHEN OTHERS THEN
  -- 무시 (등록 안되어 있을 수 있음)
END $$;

SELECT cron.schedule(
  'recharge-md-credits-daily',
  '0 21 * * *',
  $$ SELECT recharge_md_credits(); $$
);
