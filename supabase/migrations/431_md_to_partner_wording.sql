-- Migration 431: 사용자 노출 문구 "MD" → "파트너" 통합 (DB 함수)
--
-- 목적: ①(화면 tsx) 완료 후, DB 함수의 알림/에러 문구에 남은 "MD"를 "파트너"로 교체.
-- 방식: 각 함수의 "현재 활성 정의"를 그대로 복사하고 한글 문자열 리터럴의 "MD"만 교체.
--       함수 본문 로직은 일절 변경하지 않음 (문구만 교체).
-- 제외: 경매(죽은 기능) 함수 place_bid/close_auction/accept_fallback,
--       죽은 함수 request_puzzle_visit_confirm/unlock_puzzle_contact,
--       카카오 알림톡 등록 문구(③, 별도 재심사).
-- 주의: cron/트리거 결합 함수(notify_md_status_change, trg_admin_push_md_application,
--       send_puzzle_review_requests, notify_admin_md_noreply)는 CREATE OR REPLACE만 —
--       DROP/CREATE TRIGGER/cron.schedule 재실행 없음(기존 트리거·cron이 새 본문을 그대로 가리킴).
-- 식별자(md_id, md_status, 함수명, 'md' role값)와 SQL 주석의 MD는 유지.

-- ============================================================
-- 그룹 A: 오퍼 / 파티 상담
-- ============================================================

-- ==== accept_offer (활성: 357_share_invite_charge.sql) ====
CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer   puzzle_offers%ROWTYPE;
  v_puzzle  puzzles%ROWTYPE;
  v_md      users%ROWTYPE;
  v_chat_on BOOLEAN;
  v_cost    INT;
BEGIN
  v_chat_on := is_offer_chat_enabled();

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id FOR UPDATE;
  SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
  v_cost := puzzle_match_credit_cost(v_offer.puzzle_id);

  -- 검증
  IF v_puzzle.leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 수락할 수 있습니다');
  END IF;
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 처리된 오퍼입니다');
  END IF;
  IF v_puzzle.status NOT IN ('open', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마감된 퍼즐입니다');
  END IF;
  IF NOT v_chat_on AND COALESCE(v_md.md_credits, 0) < 30 THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너의 크레딧이 부족합니다');
  END IF;

  UPDATE puzzle_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  UPDATE puzzle_offers
  SET status = 'expired', updated_at = now()
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'pending';

  UPDATE users SET
    md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
  WHERE id IN (
    SELECT md_id FROM puzzle_offers
    WHERE puzzle_id = v_offer.puzzle_id
      AND id != p_offer_id
      AND status = 'expired'
  );

  INSERT INTO in_app_notifications (user_id, type, title, message)
  SELECT md_id, 'puzzle_offer_rejected', '제안 미선택', '방장이 다른 제안을 선택했습니다.'
  FROM puzzle_offers
  WHERE puzzle_id = v_offer.puzzle_id
    AND id != p_offer_id
    AND status = 'expired';

  UPDATE puzzles SET
    status = 'accepted',
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.puzzle_id;

  -- MD 크레딧 차감 — 플래그 분기
  IF v_chat_on THEN
    -- 매치당 1회. "첫 답장(1:1) / 조각 초대 / 즉시수락" 중 먼저 오는 쪽에서만 과금.
    IF v_offer.charged_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id
    ) THEN
      -- 이미 과금됨 → 이중과금 방지, 슬롯만 감소
      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
    ELSE
      -- 미과금 → 여기서 구간제 차감 + 마커 기록
      UPDATE users SET
        md_credits = md_credits - v_cost,
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id = v_offer.md_id;
      UPDATE puzzle_offers SET charged_at = now() WHERE id = p_offer_id;
    END IF;
  ELSE
    -- 기존 모델: 수락 시 30크레딧 + 슬롯 감소 (Migration 170 동작, 변경 없음)
    UPDATE users SET
      md_credits = md_credits - 30,
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_offer.md_id;
  END IF;

  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_offer.md_id,
    'puzzle_offer_accepted',
    '제안 수락됨!',
    '방장이 회원님의 제안을 선택했습니다. 방장에게 직접 연락해 예약을 확정하세요.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'kakao_open_chat_url', v_puzzle.kakao_open_chat_url,
    'leader_id', v_puzzle.leader_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== submit_offer (활성: 403_offer_received_action_url.sql) ====
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
  v_current_budget INTEGER;
  v_active_offers INTEGER;
  v_kind TEXT;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상을 찾을 수 없습니다');
  END IF;

  -- 조각/깃발 용어 (null-check 이후 안전)
  v_kind := CASE WHEN v_puzzle.is_recruiting_party THEN '조각' ELSE '깃발' END;

  IF v_md.role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 또는 관리자만 제안할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 파트너만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', format('모집이 종료된 %s입니다', v_kind));
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', format('마감된 %s입니다', v_kind));
  END IF;

  -- 카운터 동기화용으로만 현재 활성 오퍼 수 집계 (한도 차단은 제거됨)
  SELECT COUNT(*) INTO v_active_offers
  FROM puzzle_offers po
  JOIN puzzles pz ON pz.id = po.puzzle_id
  WHERE po.md_id = auth.uid()
    AND po.status = 'pending'
    AND pz.status IN ('open', 'selecting');

  -- 일일 카운터 리셋(통계용) — 한도 차단은 제거됨
  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;

  -- 예산 계산: 프론트엔드(OfferSheet.tsx)와 동일한 로직
  IF v_puzzle.current_count = v_puzzle.target_count THEN
    v_current_budget := COALESCE(
      v_puzzle.total_budget,
      v_puzzle.budget_per_person * v_puzzle.target_count
    );
  ELSE
    v_current_budget := COALESCE(
      ROUND(v_puzzle.total_budget::NUMERIC * v_puzzle.current_count
            / NULLIF(v_puzzle.target_count, 0))::INTEGER,
      v_puzzle.budget_per_person * v_puzzle.current_count
    );
  END IF;

  IF p_proposed_price <> v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  -- 같은 대상 중복 제안 방지(개수 제한 아님 — 유지)
  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', format('이미 제안한 %s입니다', v_kind));
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- 카운터 유지(드리프트 방지) — 차단엔 사용 안 함
  UPDATE users SET
    md_active_offers_count = v_active_offers + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    '파트너 제안 도착',
    CASE WHEN v_puzzle.is_recruiting_party
      THEN '파트너가 회원님의 조각에 제안서를 보냈습니다. 확인해보세요!'
      ELSE '파트너가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
    END,
    '/flags/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== invite_md_to_party (활성: 405_party_consultation_consent.sql) ====
CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.leader_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '방장만 초대할 수 있어요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL OR v_offer.puzzle_id <> p_puzzle_id THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 이미 같은 MD면 그대로 성공(멱등)
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = v_offer.md_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  -- 다른 MD가 이미 초대돼 있으면 거부 (조각당 MD 1명). 바꾸려면 먼저 내보내야 함.
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      '이미 상담 중인 파트너가 있어요. 먼저 내보낸 뒤 초대해주세요');
  END IF;

  -- 등록만(무료). 크레딧은 MD 동의 시점(start_party_consultation)에 차감.
  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  -- MD가 방을 볼 수 있도록 read 마커만 초기화
  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  -- MD 알림: 초대됨(아직 미과금) → 입장 시 동의하면 시작
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '상담 요청이 왔어요!',
    '방장이 단체채팅 상담에 초대했어요. 입장해서 상담을 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== decline_party_consultation (활성: 405_party_consultation_consent.sql) ====
CREATE OR REPLACE FUNCTION decline_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm      puzzle_party_md%ROWTYPE;
  v_leader  UUID;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;
  IF v_pm.md_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '초대된 파트너만 거절할 수 있어요');
  END IF;
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 상담을 시작해 거절할 수 없어요');
  END IF;

  SELECT leader_id INTO v_leader FROM puzzles WHERE id = p_puzzle_id;

  -- 오퍼 철회 (재초대 불가 — MD가 다시 오퍼해야 함)
  IF v_pm.offer_id IS NOT NULL THEN
    UPDATE puzzle_offers
    SET status = 'withdrawn', updated_at = now()
    WHERE id = v_pm.offer_id AND status = 'pending';
    UPDATE users SET
      md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
    WHERE id = v_pm.md_id;
  END IF;

  -- 파티 MD 해제 (슬롯 재개방) + MD의 read 마커 제거
  DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  DELETE FROM puzzle_party_reads WHERE puzzle_id = p_puzzle_id AND user_id = v_pm.md_id;

  -- 방장 알림
  IF v_leader IS NOT NULL THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      v_leader,
      'party_md_released',
      '초대한 파트너가 상담을 시작하지 않았어요',
      '초대한 파트너가 상담을 시작하지 않았어요. 다른 파트너를 초대해보세요.',
      '/party/' || p_puzzle_id
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== start_party_consultation (활성: 405_party_consultation_consent.sql) ====
CREATE OR REPLACE FUNCTION start_party_consultation(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_pm        puzzle_party_md%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_cost      INTEGER;
  v_md_name   TEXT;
  v_club_name TEXT;
  v_charged   BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_pm FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
  IF v_pm.puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '초대 정보를 찾을 수 없어요');
  END IF;
  IF v_pm.md_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', '초대된 파트너만 상담을 시작할 수 있어요');
  END IF;

  -- 이미 동의했으면 멱등 성공
  IF v_pm.consented_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = v_pm.offer_id;
  v_cost := puzzle_match_credit_cost(p_puzzle_id);

  -- 과금 (초대/즉시수락 중 먼저 온 쪽 1회만; 잔액<0 허용 = 외상 1매치분)
  IF v_offer.id IS NOT NULL AND v_offer.charged_at IS NULL THEN
    UPDATE users SET md_credits = md_credits - v_cost WHERE id = v_pm.md_id;
    UPDATE puzzle_offers SET charged_at = now() WHERE id = v_offer.id;
    v_charged := TRUE;
  END IF;

  UPDATE puzzle_party_md SET consented_at = now() WHERE puzzle_id = p_puzzle_id;

  -- 공개 시스템 메시지: 상담 시작(동의 시점에 붙임)
  SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
    INTO v_md_name FROM users u WHERE u.id = v_pm.md_id;
  SELECT name INTO v_club_name FROM clubs WHERE id = v_offer.club_id;

  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (
    p_puzzle_id, NULL,
    btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담을 시작했어요',
    TRUE
  );

  RETURN jsonb_build_object('success', true, 'charged', v_charged, 'cost', v_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== send_offer_message (활성: 425_offer_chat_cap_5_total.sql) ====
CREATE OR REPLACE FUNCTION send_offer_message(
  p_offer_id UUID,
  p_content  TEXT,
  p_media    JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_offer            puzzle_offers%ROWTYPE;
  v_puzzle           puzzles%ROWTYPE;
  v_md               users%ROWTYPE;
  v_is_md            BOOLEAN;
  v_is_leader        BOOLEAN;
  v_leader_msg_count INT;
  v_md_msg_count     INT;
  v_leader_first     BOOLEAN;
  v_chatted_teams    INT;
  v_msg_id           UUID;
BEGIN
  IF NOT is_offer_chat_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', '채팅이 비활성화되어 있습니다');
  END IF;

  IF COALESCE(btrim(p_content), '') = '' AND COALESCE(jsonb_array_length(p_media), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '내용을 입력해주세요');
  END IF;

  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- 조각은 단체채팅으로 통합 → 1:1 오퍼 채팅 차단
  IF v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각은 단체채팅을 이용해주세요');
  END IF;

  v_is_md     := (auth.uid() = v_offer.md_id);
  v_is_leader := (auth.uid() = v_puzzle.leader_id);
  IF NOT (v_is_md OR v_is_leader) THEN
    RETURN jsonb_build_object('success', false, 'error', '대화 참여자가 아닙니다');
  END IF;

  IF v_puzzle.status IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 깃발입니다');
  END IF;

  IF v_offer.status IN ('expired', 'rejected', 'withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', '종료된 대화입니다');
  END IF;

  -- 방장이 새 MD에게 첫 메시지: 한 깃발에서 대화한 MD는 총 5팀까지 (종료 포함, swap 없음)
  IF v_is_leader THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id
    ) INTO v_leader_first;

    IF v_leader_first THEN
      -- 상태 무관: 방장이 메시지를 보낸 적 있는 모든 오퍼(=대화한 팀) 카운트
      SELECT count(DISTINCT m.offer_id) INTO v_chatted_teams
      FROM puzzle_offer_messages m
      JOIN puzzle_offers o ON o.id = m.offer_id
      WHERE o.puzzle_id = v_puzzle.id
        AND m.sender_id = v_puzzle.leader_id;
      IF v_chatted_teams >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error',
          '한 깃발에서는 최대 5팀과 대화할 수 있어요');
      END IF;
      UPDATE puzzle_offers SET leader_chat_started_at = now() WHERE id = p_offer_id;
    END IF;
  END IF;

  IF v_is_md AND v_offer.status = 'pending' THEN
    SELECT count(*) INTO v_leader_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_puzzle.leader_id;
    IF v_leader_msg_count = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '방장이 먼저 대화를 시작해야 합니다');
    END IF;

    SELECT count(*) INTO v_md_msg_count FROM puzzle_offer_messages
      WHERE offer_id = p_offer_id AND sender_id = v_offer.md_id;
    IF v_md_msg_count = 0 THEN
      SELECT * INTO v_md FROM users WHERE id = v_offer.md_id FOR UPDATE;
      IF COALESCE(v_md.md_credits, 0) < 15 THEN
        RETURN jsonb_build_object('success', false, 'error', '크레딧이 부족합니다 (15 필요)');
      END IF;
      UPDATE users SET md_credits = md_credits - 15 WHERE id = v_offer.md_id;
    END IF;
  END IF;

  INSERT INTO puzzle_offer_messages (offer_id, sender_id, content, media)
  VALUES (p_offer_id, auth.uid(), COALESCE(p_content, ''), COALESCE(p_media, '[]'::jsonb))
  RETURNING id INTO v_msg_id;

  IF v_is_leader THEN
    UPDATE puzzle_offers SET leader_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_offer.md_id,
      '💬 방장이 메시지를 보냈어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  ELSE
    UPDATE puzzle_offers SET md_read_at = now() WHERE id = p_offer_id;
    PERFORM notify_user_push(
      v_puzzle.leader_id,
      '💬 파트너가 답장했어요',
      left(COALESCE(NULLIF(btrim(p_content), ''), '사진을 보냈어요'), 40),
      jsonb_build_object('type', 'offer_chat', 'offer_id', p_offer_id::text),
      '/messages/' || p_offer_id::text,
      'chat'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 그룹 B: 슬롯 / 핫딜
-- ============================================================

-- ==== claim_hotdeal_slot (활성: 328_next_week_preclaim.sql) ====
CREATE OR REPLACE FUNCTION claim_hotdeal_slot(
  p_club_id UUID,
  p_week_start DATE,
  p_benefits_by_dow JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_now_kst TIMESTAMPTZ := now();
  v_current_week_start DATE;
  v_week_open_at TIMESTAMPTZ;
  v_partner_exists BOOLEAN;
  v_already_in_week BOOLEAN;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_existing_other_md BOOLEAN;
  v_days_set INTEGER;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  SELECT name LIKE '%운영자%' INTO v_is_test_club
    FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  -- 파트너 가드 (admin 우회)
  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
    END IF;
  END IF;

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- ⬇️ 변경점: 오픈 게이트를 "이번 주" 기준으로 (다음 주 미리 선점 허용) (admin 우회)
  IF NOT v_is_admin THEN
    v_week_open_at := (v_current_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '슬롯은 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- ⬇️ 신규: 다음 주 선점 사재기 방지 (admin 우회)
  --   이번 주 슬롯의 혜택이 2일 이상 입력돼 있어야 다음 주를 미리 잡을 수 있다.
  --   (이번 주 슬롯이 없으면 카운트 0 → 자연 차단)
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    SELECT COUNT(*) INTO v_days_set
    FROM weekly_hotdeal_slots s
    CROSS JOIN LATERAL jsonb_object_keys(s.benefits_by_dow) AS k(key)
    WHERE s.md_id = v_md_id
      AND s.club_id = p_club_id
      AND s.week_start = v_current_week_start
      AND (
        (jsonb_typeof(s.benefits_by_dow -> k.key) = 'array'
          AND jsonb_array_length(s.benefits_by_dow -> k.key) > 0)
        OR (jsonb_typeof(s.benefits_by_dow -> k.key) = 'string'
          AND length(btrim(s.benefits_by_dow ->> k.key)) > 0)
      );
    IF COALESCE(v_days_set, 0) < 2 THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주 혜택을 2일 이상 입력해야 다음 주를 미리 선점할 수 있어요',
        'days_set', COALESCE(v_days_set, 0),
        'days_required', 2);
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) INTO v_already_in_week;
    IF v_already_in_week THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주에 이미 슬롯을 차지하셨어요 (주당 1슬롯)');
    END IF;
  END IF;

  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots
      WHERE club_id = p_club_id AND week_start = p_week_start
      FOR UPDATE
    ) INTO v_existing_other_md;
    IF v_existing_other_md THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주 이 클럽은 다른 파트너가 이미 차지했어요');
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 슬롯을 차지하셨어요');
    END IF;
  END IF;

  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  INSERT INTO weekly_hotdeal_slots (club_id, md_id, week_start, benefits_by_dow, expires_at)
  VALUES (p_club_id, v_md_id, p_week_start, COALESCE(p_benefits_by_dow, '{}'::JSONB), v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at,
    'is_test_club', v_is_test_club
  );
END;
$$;


-- ==== claim_share_slot (활성: 330_share_next_week_plan.sql) ====
CREATE OR REPLACE FUNCTION claim_share_slot(
  p_club_id UUID,
  p_week_start DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_now_kst TIMESTAMPTZ := now();
  v_current_week_start DATE;
  v_week_open_at TIMESTAMPTZ;
  v_partner_exists BOOLEAN;
  v_already_in_week BOOLEAN;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_existing_other_md BOOLEAN;
  v_days_set INTEGER;
  v_snapshot JSONB;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  SELECT name LIKE '%운영자%' INTO v_is_test_club
    FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
    END IF;
  END IF;

  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;

  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 또는 다음 주만 차지할 수 있어요');
  END IF;

  -- 오픈 게이트: 이번 주 기준 (다음 주 미리 선점 허용) (admin 우회)
  IF NOT v_is_admin THEN
    v_week_open_at := (v_current_week_start::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    IF v_now_kst < v_week_open_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '조각 자리는 매주 월요일 오후 6시에 오픈돼요',
        'open_at', v_week_open_at
      );
    END IF;
  END IF;

  -- 다음 주 선점 사재기 방지 (admin 우회): 이번 주 운영 중 + 요일표 2일 이상
  IF NOT v_is_admin AND p_week_start > v_current_week_start THEN
    IF NOT EXISTS (
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND md_id = v_md_id AND week_start = v_current_week_start
    ) THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주에 이 클럽을 운영해야 다음 주를 미리 선점할 수 있어요');
    END IF;

    SELECT COUNT(DISTINCT dow) INTO v_days_set
    FROM share_weekday_plan
    WHERE md_id = v_md_id AND club_id = p_club_id;
    IF COALESCE(v_days_set, 0) < 2 THEN
      RETURN jsonb_build_object('success', false,
        'error', '이번 주 요일표를 2일 이상 세팅해야 다음 주를 미리 선점할 수 있어요',
        'days_set', COALESCE(v_days_set, 0),
        'days_required', 2);
    END IF;
  END IF;

  -- 1MD 1주 1슬롯 룰 (테스트 클럽 우회)
  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = v_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) INTO v_already_in_week;
    IF v_already_in_week THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주에 이미 조각 자리를 차지하셨어요 (주당 1자리)');
    END IF;
  END IF;

  IF NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start
      FOR UPDATE
    ) INTO v_existing_other_md;
    IF v_existing_other_md THEN
      RETURN jsonb_build_object('success', false, 'error', '이번 주 이 클럽 조각 자리는 다른 파트너가 이미 차지했어요');
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots
      WHERE club_id = p_club_id AND week_start = p_week_start AND md_id = v_md_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이미 이 조각 자리를 차지하셨어요');
    END IF;
  END IF;

  -- 다음 주 선점이면 현재 요일표를 스냅샷으로 복사 (이번 주는 NULL → 공유 템플릿 사용)
  IF p_week_start > v_current_week_start THEN
    SELECT COALESCE(jsonb_object_agg(dow, ids), '{}'::jsonb) INTO v_snapshot
    FROM (
      SELECT dow, jsonb_agg(option_id ORDER BY sort_order) AS ids
      FROM share_weekday_plan
      WHERE md_id = v_md_id AND club_id = p_club_id
      GROUP BY dow
    ) t;
  ELSE
    v_snapshot := NULL;
  END IF;

  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

  INSERT INTO weekly_share_slots (club_id, md_id, week_start, expires_at, plan_snapshot)
  VALUES (p_club_id, v_md_id, p_week_start, v_expires_at, v_snapshot)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at,
    'is_test_club', v_is_test_club
  );
END;
$$;


-- ==== admin_assign_hotdeal_slot (활성: 290_admin_assign_hotdeal_slot.sql) ====
CREATE OR REPLACE FUNCTION admin_assign_hotdeal_slot(
  p_club_id UUID,
  p_week_start DATE,
  p_md_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_role TEXT;
  v_md_role TEXT;
  v_partner_exists BOOLEAN;
  v_is_test_club BOOLEAN;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_current_week_start DATE;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1) 호출자 admin 확인
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller;
  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요해요');
  END IF;

  -- 2) 배정 대상 MD 유효성
  SELECT role INTO v_md_role FROM users WHERE id = p_md_id;
  IF v_md_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상 유저를 찾을 수 없어요');
  END IF;
  IF v_md_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너가 아니에요');
  END IF;

  -- 3) week_start 정합성 + 범위(이번주 ~ 다다음주)
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;
  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 14 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 ~ 다다음 주만 배정할 수 있어요');
  END IF;

  -- 4) 파트너 검증 (해당 클럽 파트너 MD만)
  SELECT EXISTS(
    SELECT 1 FROM club_partners
    WHERE club_id = p_club_id AND md_id = p_md_id
  ) INTO v_partner_exists;
  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
  END IF;

  -- 테스트 클럽 판별 (1MD 1주 룰 우회용)
  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  -- 5) 덮어쓰기 금지: 빈 슬롯에만 (FOR UPDATE 잠금으로 레이스 안전)
  IF EXISTS(
    SELECT 1 FROM weekly_hotdeal_slots
    WHERE club_id = p_club_id AND week_start = p_week_start
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 차지된 슬롯이에요 (덮어쓰기 불가)');
  END IF;

  -- 6) 1MD 1주 1슬롯 룰 (테스트 클럽 제외)
  IF NOT v_is_test_club THEN
    IF EXISTS(
      SELECT 1 FROM weekly_hotdeal_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = p_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이 파트너는 해당 주에 이미 다른 슬롯을 보유 중이에요');
    END IF;
  END IF;

  -- 7) INSERT
  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
  INSERT INTO weekly_hotdeal_slots (club_id, md_id, week_start, benefits_by_dow, expires_at)
  VALUES (p_club_id, p_md_id, p_week_start, '{}'::JSONB, v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;


-- ==== admin_assign_share_slot (활성: 309_admin_assign_share_slot.sql) ====
CREATE OR REPLACE FUNCTION admin_assign_share_slot(
  p_club_id UUID,
  p_week_start DATE,
  p_md_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_role TEXT;
  v_md_role TEXT;
  v_partner_exists BOOLEAN;
  v_is_test_club BOOLEAN;
  v_today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_current_week_start DATE;
  v_slot_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1) 호출자 admin 확인
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller;
  IF v_caller_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요해요');
  END IF;

  -- 2) 배정 대상 MD 유효성
  SELECT role INTO v_md_role FROM users WHERE id = p_md_id;
  IF v_md_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '대상 유저를 찾을 수 없어요');
  END IF;
  IF v_md_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너가 아니에요');
  END IF;

  -- 3) week_start 정합성 + 범위(이번주 ~ 다음주)
  IF p_week_start <> week_start_kst(p_week_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'week_start는 월요일이어야 해요');
  END IF;
  v_current_week_start := week_start_kst(v_today_kst);
  IF p_week_start < v_current_week_start OR p_week_start > v_current_week_start + 7 THEN
    RETURN jsonb_build_object('success', false, 'error', '이번 주 ~ 다음 주만 배정할 수 있어요');
  END IF;

  -- 4) 파트너 검증 (해당 클럽 파트너 MD만)
  SELECT EXISTS(
    SELECT 1 FROM club_partners
    WHERE club_id = p_club_id AND md_id = p_md_id
  ) INTO v_partner_exists;
  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
  END IF;

  -- 테스트 클럽 판별 (1MD 1주 룰 우회용)
  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  -- 5) 덮어쓰기 금지: 빈 슬롯에만 (FOR UPDATE 잠금으로 레이스 안전)
  IF EXISTS(
    SELECT 1 FROM weekly_share_slots
    WHERE club_id = p_club_id AND week_start = p_week_start
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 차지된 조각 자리예요 (덮어쓰기 불가)');
  END IF;

  -- 6) 1MD 1주 1슬롯 룰 (테스트 클럽 제외, weekly_share_slots만 카운트)
  IF NOT v_is_test_club THEN
    IF EXISTS(
      SELECT 1 FROM weekly_share_slots s
      JOIN clubs c ON c.id = s.club_id
      WHERE s.md_id = p_md_id
        AND s.week_start = p_week_start
        AND c.name NOT LIKE '%운영자%'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '이 파트너는 해당 주에 이미 다른 조각 자리를 보유 중이에요');
    END IF;
  END IF;

  -- 7) INSERT
  v_expires_at := ((p_week_start + 7)::TEXT || ' 18:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
  INSERT INTO weekly_share_slots (club_id, md_id, week_start, expires_at)
  VALUES (p_club_id, p_md_id, p_week_start, v_expires_at)
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'slot_id', v_slot_id,
    'expires_at', v_expires_at
  );
END;
$$;


-- ==== create_daily_hotdeal (활성: 267_hotdeal_zone_required.sql) ====
CREATE OR REPLACE FUNCTION create_daily_hotdeal(
  p_club_id UUID,
  p_title TEXT,
  p_ends_at TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_price INTEGER DEFAULT NULL,
  p_walk_minutes INTEGER DEFAULT NULL,
  p_nearest_station TEXT DEFAULT NULL,
  p_original_price INTEGER DEFAULT NULL,
  p_table_info TEXT DEFAULT NULL,
  p_table_features TEXT[] DEFAULT '{}',
  p_liquor_includes TEXT[] DEFAULT '{}',
  p_table_zone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_is_admin BOOLEAN;
  v_is_test_club BOOLEAN;
  v_partner_exists BOOLEAN;
  v_zone_clash BOOLEAN;
  v_id UUID;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한이 필요해요');
  END IF;
  v_is_admin := v_role = 'admin';

  SELECT name LIKE '%운영자%' INTO v_is_test_club FROM clubs WHERE id = p_club_id;
  v_is_test_club := COALESCE(v_is_test_club, FALSE);

  IF NOT v_is_admin AND NOT v_is_test_club THEN
    SELECT EXISTS(
      SELECT 1 FROM club_partners
      WHERE club_id = p_club_id AND md_id = v_md_id
    ) INTO v_partner_exists;
    IF NOT v_partner_exists THEN
      RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
    END IF;
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '제목을 입력해주세요');
  END IF;
  IF p_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', '종료 시각이 미래여야 해요');
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '특가를 입력해주세요');
  END IF;
  IF p_original_price IS NOT NULL AND p_original_price <= p_price THEN
    RETURN jsonb_build_object('success', false, 'error', '정가는 특가보다 높아야 해요');
  END IF;

  -- 자리 등급 필수
  IF p_table_zone IS NULL OR length(trim(p_table_zone)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급을 선택해주세요');
  END IF;
  IF p_table_zone NOT IN ('bar', 'bar_aisle', 'sub_main', 'main', 'prime') THEN
    RETURN jsonb_build_object('success', false, 'error', '자리 등급 값이 올바르지 않아요');
  END IF;

  -- 같은 클럽 × 같은 자리 active 중복 사전 체크 (친절 에러용)
  SELECT EXISTS(
    SELECT 1 FROM daily_hotdeals
    WHERE club_id = p_club_id AND table_zone = p_table_zone AND status = 'active'
  ) INTO v_zone_clash;
  IF v_zone_clash THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이 자리 등급은 이미 활성 핫딜이 있어요. 기존 핫딜을 종료한 뒤 다시 등록해주세요'
    );
  END IF;

  INSERT INTO daily_hotdeals (
    club_id, md_id, title, description, thumbnail_url, price, original_price,
    walk_minutes, nearest_station, ends_at,
    table_info, table_features, liquor_includes, table_zone
  )
  VALUES (
    p_club_id, v_md_id, trim(p_title),
    NULLIF(TRIM(p_description), ''),
    NULLIF(TRIM(p_thumbnail_url), ''),
    p_price, p_original_price,
    p_walk_minutes,
    NULLIF(TRIM(p_nearest_station), ''),
    p_ends_at,
    NULLIF(TRIM(p_table_info), ''),
    COALESCE(p_table_features, '{}'),
    COALESCE(p_liquor_includes, '{}'),
    p_table_zone
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;


-- ==== update_club_partner_fields (활성: 310_partner_edit_menu_floorplan.sql) ====
CREATE OR REPLACE FUNCTION update_club_partner_fields(
  p_club_id UUID,
  p_tags TEXT[] DEFAULT NULL,
  p_operating_hours TEXT DEFAULT NULL,
  p_dresscode TEXT DEFAULT NULL,
  p_drink_menu_urls TEXT[] DEFAULT NULL,
  p_floor_plan_urls TEXT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_is_partner BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role = 'admin' INTO v_is_admin FROM users WHERE id = v_md_id;
  SELECT EXISTS(SELECT 1 FROM club_partners WHERE club_id = p_club_id AND md_id = v_md_id)
    INTO v_is_partner;

  IF NOT (COALESCE(v_is_admin, false) OR COALESCE(v_is_partner, false)) THEN
    RETURN jsonb_build_object('success', false, 'error', '이 클럽의 파트너가 아니에요');
  END IF;

  -- NULL = 미변경(기존 유지). 빈 배열 '{}' = 전체 삭제(명시적 변경).
  -- COALESCE는 빈 배열을 NULL로 보지 않으므로 "전부 지우기"도 정상 반영됨.
  UPDATE clubs SET
    tags                  = COALESCE(p_tags, tags),
    operating_hours       = COALESCE(p_operating_hours, operating_hours),
    dresscode             = COALESCE(p_dresscode, dresscode),
    drink_menu_urls       = COALESCE(p_drink_menu_urls, drink_menu_urls),
    -- 하위 호환: 단일 컬럼에 첫 번째 URL 미러링 (빈 배열이면 NULL)
    drink_menu_url        = CASE WHEN p_drink_menu_urls IS NOT NULL THEN p_drink_menu_urls[1] ELSE drink_menu_url END,
    drink_menu_updated_at = CASE WHEN p_drink_menu_urls IS NOT NULL THEN now() ELSE drink_menu_updated_at END,
    floor_plan_urls       = COALESCE(p_floor_plan_urls, floor_plan_urls),
    floor_plan_url        = CASE WHEN p_floor_plan_urls IS NOT NULL THEN p_floor_plan_urls[1] ELSE floor_plan_url END
  WHERE id = p_club_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ============================================================
-- 그룹 C: 퍼즐 / 방장
-- ============================================================

-- ==== mark_puzzle_visited (활성: 147_simplify_puzzle_visit_md_only.sql) ====
CREATE OR REPLACE FUNCTION mark_puzzle_visited(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 권한: MD 본인만
  IF v_caller != v_offer.md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너만 거래완료를 마킹할 수 있습니다');
  END IF;

  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 마킹할 수 있습니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마킹된 거래입니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;
  IF v_puzzle.event_date IS NULL OR v_puzzle.event_date >= CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', '이벤트 날짜가 지난 후에만 마킹할 수 있습니다');
  END IF;

  -- 즉시 확정: visit_marked_at 설정 → 트리거가 leader & MD deal_count_total +1
  UPDATE puzzle_offers
  SET visit_result = 'visited',
      visit_marked_at = now(),
      visit_requested_by = v_caller,
      visit_requested_at = now(),
      updated_at = now()
  WHERE id = p_offer_id;

  -- leader에게 알림 (MD 일방 마킹이므로 통보 성격)
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_visit_confirmed',
    '거래 확정됨',
    '파트너가 거래를 확정했습니다. 거래 카운트가 +1 적립되었습니다.',
    '/flags/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== mark_puzzle_noshow (활성: 158_mark_puzzle_noshow.sql) ====
CREATE OR REPLACE FUNCTION mark_puzzle_noshow(p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_offer puzzle_offers%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_offer FROM puzzle_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;

  -- 권한: MD 본인만
  IF v_caller != v_offer.md_id THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너만 마킹할 수 있습니다');
  END IF;

  IF v_offer.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', '수락된 오퍼만 마킹할 수 있습니다');
  END IF;

  IF v_offer.visit_marked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 마킹된 거래입니다');
  END IF;

  SELECT * INTO v_puzzle FROM puzzles WHERE id = v_offer.puzzle_id;

  -- noshow 마킹: visit_result = 'noshow'
  UPDATE puzzle_offers
  SET visit_result = 'noshow',
      visit_marked_at = now(),
      visit_requested_by = v_caller,
      visit_requested_at = now(),
      updated_at = now()
  WHERE id = p_offer_id;

  -- MD 크레딧 즉시 환불 (오퍼 수락 시 차감된 30 크레딧)
  UPDATE users
  SET md_credits = md_credits + 30
  WHERE id = v_offer.md_id;

  -- 방장에게 통보: 관리자 검토 중
  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_visit_pending',
    '연락 미수신 신고',
    '파트너가 연락을 못 받았다고 표시했습니다. 관리자가 패널티를 검토합니다.',
    '/flags/' || v_puzzle.id
  );

  RETURN jsonb_build_object('success', true, 'credits_refunded', 30);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== submit_puzzle_review (활성: 260_puzzle_reviews.sql) ====
CREATE OR REPLACE FUNCTION submit_puzzle_review(
  p_puzzle_id UUID,
  p_rating INT,
  p_comment TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_puzzle RECORD;
  v_offer RECORD;
  v_review_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '로그인이 필요해요');
  END IF;

  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RETURN json_build_object('success', false, 'error', '별점은 1~5 사이여야 해요');
  END IF;

  SELECT id, leader_id, status, accepted_offer_id
  INTO v_puzzle
  FROM puzzles
  WHERE id = p_puzzle_id;

  IF v_puzzle IS NULL THEN
    RETURN json_build_object('success', false, 'error', '깃발을 찾을 수 없어요');
  END IF;

  IF v_puzzle.leader_id <> v_user_id THEN
    RETURN json_build_object('success', false, 'error', '방장만 리뷰를 작성할 수 있어요');
  END IF;

  IF v_puzzle.status <> 'accepted' THEN
    RETURN json_build_object('success', false, 'error', '매치된 깃발만 리뷰 가능해요');
  END IF;

  IF v_puzzle.accepted_offer_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '수락된 오퍼 정보가 없어요');
  END IF;

  SELECT md_id, club_id
  INTO v_offer
  FROM puzzle_offers
  WHERE id = v_puzzle.accepted_offer_id;

  IF v_offer IS NULL OR v_offer.md_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '파트너 정보를 찾을 수 없어요');
  END IF;

  -- UPSERT
  INSERT INTO puzzle_reviews (puzzle_id, leader_id, md_id, club_id, rating, comment, tags)
  VALUES (p_puzzle_id, v_user_id, v_offer.md_id, v_offer.club_id, p_rating, NULLIF(TRIM(p_comment), ''), COALESCE(p_tags, '{}'))
  ON CONFLICT (puzzle_id, leader_id) DO UPDATE
  SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    tags = EXCLUDED.tags,
    updated_at = now()
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$;


-- ==== vote_offer (활성: 364_party_md_leak_fixes.sql) ====
CREATE OR REPLACE FUNCTION vote_offer(p_offer_id UUID, p_vote TEXT)
RETURNS JSONB AS $$
DECLARE
  v_puzzle_id UUID;
  v_existing  TEXT;
BEGIN
  IF p_vote NOT IN ('like', 'dislike') THEN
    RETURN jsonb_build_object('success', false, 'error', '잘못된 요청입니다');
  END IF;

  SELECT puzzle_id INTO v_puzzle_id FROM puzzle_offers WHERE id = p_offer_id;
  IF v_puzzle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '오퍼를 찾을 수 없습니다');
  END IF;
  IF NOT is_party_participant(v_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;
  IF is_puzzle_md(v_puzzle_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너는 투표할 수 없어요');
  END IF;

  SELECT vote INTO v_existing FROM puzzle_offer_votes
    WHERE offer_id = p_offer_id AND user_id = auth.uid();

  IF v_existing = p_vote THEN
    DELETE FROM puzzle_offer_votes WHERE offer_id = p_offer_id AND user_id = auth.uid();
    RETURN jsonb_build_object('success', true, 'vote', NULL);
  END IF;

  INSERT INTO puzzle_offer_votes (offer_id, user_id, vote)
  VALUES (p_offer_id, auth.uid(), p_vote)
  ON CONFLICT (offer_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = now();

  RETURN jsonb_build_object('success', true, 'vote', p_vote);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== block_offer_on_md_direct (활성: 367_block_offer_on_md_direct.sql) ====
CREATE OR REPLACE FUNCTION block_offer_on_md_direct()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM puzzles
    WHERE id = NEW.puzzle_id AND host_is_md = true
  ) THEN
    RAISE EXCEPTION '파트너 직통 조각에는 오퍼할 수 없어요';
  END IF;
  RETURN NEW;
END;
$$;


-- ==== leave_party (활성: 400_leave_party.sql) ====
CREATE OR REPLACE FUNCTION leave_party(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle      puzzles%ROWTYPE;
  v_guest       INTEGER;
  v_name        TEXT;
  v_md_name     TEXT;
  v_club_name   TEXT;
  v_offer_id    UUID;
  v_rcpt        RECORD;
  v_next_leader UUID;
  v_next_name   TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;
  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '조각을 찾을 수 없습니다');
  END IF;
  IF NOT v_puzzle.is_recruiting_party THEN
    RETURN jsonb_build_object('success', false, 'error', '조각이 아닙니다');
  END IF;

  -- 1) MD(초대됨) 자가 나가기 → 슬롯 열림
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid()) THEN
    SELECT offer_id INTO v_offer_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id;
    DELETE FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid();
    SELECT COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), 'MD')
      INTO v_md_name FROM users u WHERE u.id = auth.uid();
    SELECT c.name INTO v_club_name
      FROM puzzle_offers o LEFT JOIN clubs c ON c.id = o.club_id WHERE o.id = v_offer_id;
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL,
      btrim(COALESCE(v_club_name || ' ', '') || v_md_name) || ' 파트너가 상담에서 나갔어요', TRUE);
    RETURN jsonb_build_object('success', true, 'role', 'md');
  END IF;

  -- 2) 방장 나가기 → 다음 멤버에게 방장 위임 (남은 멤버 없으면 조각 마감)
  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
      INTO v_name FROM users WHERE id = auth.uid();
    SELECT guest_count INTO v_guest FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

    -- 다음 방장 = 방장 제외 가장 오래 참여한 멤버
    SELECT user_id INTO v_next_leader FROM puzzle_members
      WHERE puzzle_id = p_puzzle_id AND user_id <> auth.uid()
      ORDER BY joined_at ASC LIMIT 1;

    -- 나가는 방장 제거 + 인원 감소
    DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
    UPDATE puzzles SET current_count = GREATEST(0, current_count - (1 + COALESCE(v_guest, 0)))
      WHERE id = p_puzzle_id;

    IF v_next_leader IS NOT NULL THEN
      -- 방장 위임
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;
      SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
        INTO v_next_name FROM users WHERE id = v_next_leader;
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL,
        v_name || '님이 나가고 ' || v_next_name || '님이 새 방장이 되었어요', TRUE);
      INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
      VALUES (v_next_leader, 'puzzle_leader_changed', '방장이 되었어요',
        '기존 방장이 나가 회원님이 새 방장이 되었어요. 파트너 상담을 이어가보세요!',
        '/party/' || p_puzzle_id);
      RETURN jsonb_build_object('success', true, 'role', 'leader_transferred');
    ELSE
      -- 남은 멤버 없음 → 마감
      UPDATE puzzles SET status = 'cancelled', cancelled_at = now(),
        cancelled_reason = COALESCE(cancelled_reason, '방장 나감')
        WHERE id = p_puzzle_id;
      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
        WHERE puzzle_id = p_puzzle_id AND status = 'pending';
      INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
      VALUES (p_puzzle_id, NULL, '방장이 나가 조각이 마감되었어요', TRUE);
      -- 초대된 MD가 있으면 알림
      FOR v_rcpt IN
        SELECT md_id AS participant_id FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id
      LOOP
        INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
        VALUES (v_rcpt.participant_id, 'puzzle_cancelled', '조각이 마감됐어요',
          '방장이 나가면서 이 조각이 마감됐어요.', '/');
      END LOOP;
      RETURN jsonb_build_object('success', true, 'role', 'leader_cancelled');
    END IF;
  END IF;

  -- 3) 파티원(멤버) 나가기 → 인원 감소
  SELECT guest_count INTO v_guest FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여자가 아닙니다');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_name FROM users WHERE id = auth.uid();

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET current_count = GREATEST(1, current_count - (1 + COALESCE(v_guest, 0)))
    WHERE id = p_puzzle_id;
  INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
  VALUES (p_puzzle_id, NULL, v_name || '님이 나갔어요', TRUE);

  RETURN jsonb_build_object('success', true, 'role', 'member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== leave_puzzle (활성: 360_party_chat_polish.sql) ====
CREATE OR REPLACE FUNCTION leave_puzzle(p_puzzle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle puzzles%ROWTYPE;
  v_guest INTEGER;
  v_next_leader UUID;
  v_user_name TEXT;
BEGIN
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id FOR UPDATE;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;

  SELECT guest_count INTO v_guest FROM puzzle_members
  WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '참여 기록이 없습니다');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '회원')
    INTO v_user_name FROM users WHERE id = auth.uid();

  DELETE FROM puzzle_members WHERE puzzle_id = p_puzzle_id AND user_id = auth.uid();
  UPDATE puzzles SET
    current_count = current_count - (1 + COALESCE(v_guest, 0))
  WHERE id = p_puzzle_id;

  -- 조각 단체방 시스템 메시지 (조각만; 깃발은 방 없음)
  IF v_puzzle.is_recruiting_party THEN
    INSERT INTO puzzle_party_messages (puzzle_id, sender_id, content, is_system)
    VALUES (p_puzzle_id, NULL, v_user_name || '님이 나갔어요', TRUE);
  END IF;

  IF v_puzzle.leader_id = auth.uid() THEN
    SELECT user_id INTO v_next_leader
    FROM puzzle_members
    WHERE puzzle_id = p_puzzle_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      UPDATE puzzles SET leader_id = v_next_leader WHERE id = p_puzzle_id;

      INSERT INTO in_app_notifications (user_id, type, title, message)
      VALUES (
        v_next_leader,
        'puzzle_leader_changed',
        '방장이 되었습니다',
        '기존 방장이 깃발을 내려 회원님이 새 방장이 되었습니다. 파트너 제안을 확인해보세요!'
      );
    ELSE
      UPDATE puzzles SET status = 'cancelled' WHERE id = p_puzzle_id;

      UPDATE puzzle_offers SET status = 'expired', updated_at = now()
      WHERE puzzle_id = p_puzzle_id AND status = 'pending';

      UPDATE users SET
        md_active_offers_count = GREATEST(md_active_offers_count - 1, 0)
      WHERE id IN (
        SELECT md_id FROM puzzle_offers
        WHERE puzzle_id = p_puzzle_id AND status = 'expired'
          AND updated_at > now() - INTERVAL '1 second'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 그룹 D: 권한 / 알림 / 트리거 / cron  (⚠️ CREATE OR REPLACE만 — TRIGGER/cron 재실행 없음)
-- ============================================================

-- ==== set_md_puzzle_areas (활성: 228_md_puzzle_area_subs.sql) ====
CREATE OR REPLACE FUNCTION set_md_puzzle_areas(p_areas TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증 필요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한 필요');
  END IF;

  DELETE FROM md_puzzle_area_subs WHERE md_id = v_md_id;

  IF p_areas IS NOT NULL AND array_length(p_areas, 1) > 0 THEN
    INSERT INTO md_puzzle_area_subs (md_id, area)
    SELECT v_md_id, unnest(p_areas)
    ON CONFLICT (md_id, area) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== set_share_weekday_plan (활성: 303_share_weekday_plan.sql) ====
CREATE OR REPLACE FUNCTION set_share_weekday_plan(
  p_club_id   UUID,
  p_dow       TEXT,
  p_option_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_role TEXT;
  v_opt UUID;
  v_idx INTEGER := 0;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '파트너 권한이 필요해요');
  END IF;

  IF p_dow NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
    RETURN jsonb_build_object('success', false, 'error', '요일 값이 올바르지 않아요');
  END IF;

  -- 이 (MD, 클럽, 요일)의 기존 배정 전부 삭제
  DELETE FROM share_weekday_plan
   WHERE md_id = v_md_id AND club_id = p_club_id AND dow = p_dow;

  -- 새 배열로 재삽입 (옵션이 본인 소유인지 + 같은 클럽인지 검증)
  FOREACH v_opt IN ARRAY COALESCE(p_option_ids, ARRAY[]::UUID[])
  LOOP
    IF EXISTS (
      SELECT 1 FROM share_options
       WHERE id = v_opt AND md_id = v_md_id AND club_id = p_club_id AND is_active
    ) THEN
      INSERT INTO share_weekday_plan (md_id, club_id, dow, option_id, sort_order)
      VALUES (v_md_id, p_club_id, p_dow, v_opt, v_idx)
      ON CONFLICT (md_id, club_id, dow, option_id) DO NOTHING;
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_idx);
END;
$$;


-- ==== notify_md_status_change (활성: 041_in_app_notifications.sql) — 트리거 함수 ====
CREATE OR REPLACE FUNCTION notify_md_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 승인
  IF OLD.md_status IS DISTINCT FROM 'approved' AND NEW.md_status = 'approved' THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.id,
      'md_approved',
      '파트너 승인 완료',
      '축하합니다! 파트너 신청이 승인되었습니다. 지금 바로 경매를 등록해보세요.',
      '/md/dashboard'
    );
  END IF;

  -- 거절
  IF OLD.md_status IS DISTINCT FROM 'rejected' AND NEW.md_status = 'rejected' THEN
    INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.id,
      'md_rejected',
      '파트너 신청 결과',
      '파트너 신청이 반려되었습니다. 사유: ' || COALESCE(NEW.md_rejection_reason, '사유 미기재'),
      '/md/apply'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==== trg_admin_push_md_application (활성: 164_admin_push_triggers.sql) — 트리거 함수 ====
CREATE OR REPLACE FUNCTION trg_admin_push_md_application()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.md_status IS DISTINCT FROM 'pending' AND NEW.md_status = 'pending' THEN
    PERFORM notify_admins_push(
      '🙋 새 파트너가 신청했어요!',
      format('%s님이 파트너 신청', COALESCE(NEW.name, '익명')),
      jsonb_build_object(
        'type', 'md_application',
        'user_id', NEW.id::TEXT
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==== send_puzzle_review_requests (활성: 262_puzzle_review_request_cron.sql) — cron 함수 ====
CREATE OR REPLACE FUNCTION send_puzzle_review_requests()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_club_name TEXT;
  v_count INT := 0;
  v_cutoff DATE;
BEGIN
  -- KST 기준 어제 (오늘 14시 발송 = 어제 매치된 건)
  v_cutoff := (now() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day';

  FOR v_record IN
    SELECT
      p.id AS puzzle_id,
      p.leader_id,
      p.event_date,
      p.accepted_offer_id
    FROM puzzles p
    WHERE p.status = 'accepted'
      AND p.event_date <= v_cutoff
      AND p.review_requested_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_reviews r
        WHERE r.puzzle_id = p.id AND r.leader_id = p.leader_id
      )
    ORDER BY p.event_date DESC
    LIMIT 500
  LOOP
    -- 클럽명 조회 (있으면 본문에 노출)
    SELECT c.name INTO v_club_name
    FROM puzzle_offers o
    LEFT JOIN clubs c ON c.id = o.club_id
    WHERE o.id = v_record.accepted_offer_id;

    PERFORM notify_user_push(
      v_record.leader_id,
      CASE
        WHEN v_club_name IS NOT NULL THEN v_club_name || ' 어떠셨어요? ⭐'
        ELSE '지난번 매치 어떠셨어요? ⭐'
      END,
      '한마디 남겨주시면 파트너와 다음 방문자에게 큰 도움이 돼요',
      jsonb_build_object('puzzle_id', v_record.puzzle_id, 'type', 'review_request'),
      '/flags/' || v_record.puzzle_id || '/review',
      'review_request'
    );

    UPDATE puzzles SET review_requested_at = now() WHERE id = v_record.puzzle_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ==== notify_admin_md_noreply (활성: 406_admin_chat_alerts.sql) — cron 함수 ====
CREATE OR REPLACE FUNCTION notify_admin_md_noreply()
RETURNS INTEGER AS $$
DECLARE
  v_rec RECORD; v_count INTEGER := 0;
  v_leader_name TEXT; v_md_name TEXT; v_club_name TEXT;
BEGIN
  FOR v_rec IN
    SELECT o.id AS offer_id, o.puzzle_id, o.md_id, o.club_id, p.leader_id
    FROM puzzle_offers o JOIN puzzles p ON p.id = o.puzzle_id
    WHERE o.leader_chat_started_at IS NOT NULL
      AND o.leader_chat_started_at < now() - interval '2 hours'
      AND o.md_noreply_notified_at IS NULL
      AND o.status NOT IN ('rejected','expired','withdrawn','accepted')
      AND p.status NOT IN ('expired','cancelled')
      AND NOT EXISTS (SELECT 1 FROM puzzle_offer_messages m WHERE m.offer_id = o.id AND m.sender_id = o.md_id)
  LOOP
    UPDATE puzzle_offers SET md_noreply_notified_at = now() WHERE id = v_rec.offer_id AND md_noreply_notified_at IS NULL;
    SELECT display_name INTO v_leader_name FROM users WHERE id = v_rec.leader_id;
    SELECT display_name INTO v_md_name FROM users WHERE id = v_rec.md_id;
    SELECT name INTO v_club_name FROM clubs WHERE id = v_rec.club_id;
    PERFORM notify_admins_push(
      '⏰ 파트너 답장 없음 (2시간)',
      COALESCE(v_md_name,'MD') || '가 ' || COALESCE(v_leader_name,'유저') || '에게 답장 안 함'
        || CASE WHEN v_club_name IS NOT NULL THEN ' · ' || v_club_name ELSE '' END,
      jsonb_build_object('type','md_noreply','offer_id',v_rec.offer_id::TEXT,'url','/messages/' || v_rec.offer_id::TEXT)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
