-- Migration 476: 조각 파트너 초대 시 MD에게 앱 푸시 추가
-- 적용일: 2026-07-21
--
-- 문제: invite_md_to_party()가 in_app_notifications만 INSERT →
--   MD가 앱을 켜지 않으면 초대된 사실을 모름 (1:1 오퍼 채팅·파티 채팅은 이미 푸시가 있음).
-- 해결: 인앱 알림 직후 notify_user_push('chat') 추가. 나머지 로직은 Migration 431 본문 보존.

CREATE OR REPLACE FUNCTION invite_md_to_party(p_puzzle_id UUID, p_offer_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_puzzle    puzzles%ROWTYPE;
  v_offer     puzzle_offers%ROWTYPE;
  v_label     TEXT;
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
  -- 다른 MD가 이미 초대돼 있으면 거부 (조각당 MD 1명)
  IF EXISTS (SELECT 1 FROM puzzle_party_md WHERE puzzle_id = p_puzzle_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      '이미 상담 중인 파트너가 있어요. 먼저 내보낸 뒤 초대해주세요');
  END IF;

  -- 등록만(무료). 크레딧은 MD 동의 시점(start_party_consultation)에 차감.
  INSERT INTO puzzle_party_md (puzzle_id, md_id, offer_id)
  VALUES (p_puzzle_id, v_offer.md_id, p_offer_id);

  INSERT INTO puzzle_party_reads (puzzle_id, user_id, last_read_at)
  VALUES (p_puzzle_id, v_offer.md_id, now())
  ON CONFLICT (puzzle_id, user_id) DO UPDATE SET last_read_at = now();

  INSERT INTO in_app_notifications (user_id, type, title, message, action_url)
  VALUES (
    v_offer.md_id,
    'party_md_invited',
    '상담 요청이 왔어요!',
    '방장이 단체채팅 상담에 초대했어요. 입장해서 상담을 시작해보세요!',
    '/party/' || p_puzzle_id
  );

  -- 앱 푸시 (인앱만으론 앱 미실행 시 인지 불가)
  v_label := COALESCE(v_puzzle.area, '') || ' '
             || EXTRACT(MONTH FROM v_puzzle.event_date)::TEXT || '/' || EXTRACT(DAY FROM v_puzzle.event_date)::TEXT;
  PERFORM notify_user_push(
    v_offer.md_id,
    '🎉 상담 요청이 왔어요!',
    btrim(v_label) || ' 조각 · 입장해서 상담을 시작해보세요',
    jsonb_build_object('type','party_md_invited','puzzle_id',p_puzzle_id::TEXT),
    '/party/' || p_puzzle_id::TEXT,
    'chat'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
