-- ============================================
-- Migration 173: 조각 매칭 RPC 함수 4개
-- ============================================
-- 1. claim_share_seat       — 좌석 점유 (유저)
-- 2. cancel_share_claim     — 참여 취소 (유저)
-- 3. md_update_external_attendees — 외부 인원 증감 (MD)
-- 4. md_kick_share_claim    — 강퇴 (MD)

-- ============================================================
-- 1) claim_share_seat
-- ============================================================
CREATE OR REPLACE FUNCTION claim_share_seat(p_auction_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction  auctions%ROWTYPE;
  v_existing share_claims%ROWTYPE;
  v_md_chat  TEXT;
BEGIN
  -- auctions 행 락
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  -- 기본 유효성 검사
  IF v_auction.listing_type <> 'share' THEN
    RETURN json_build_object('success', false, 'error', 'NOT_SHARE_LISTING');
  END IF;

  IF v_auction.md_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'OWN_LISTING');
  END IF;

  IF v_auction.status NOT IN ('scheduled', 'active') THEN
    RETURN json_build_object('success', false, 'error', 'NOT_OPEN');
  END IF;

  IF v_auction.share_deadline < now() THEN
    RETURN json_build_object('success', false, 'error', 'EXPIRED');
  END IF;

  -- 만석 체크: NF 점유 + 외부 인원 합산
  IF v_auction.seats_claimed + v_auction.external_attendees >= v_auction.total_seats THEN
    RETURN json_build_object('success', false, 'error', 'FULL');
  END IF;

  -- MD 카카오 URL 사전 검증 (INSERT 이전 체크 → 롤백 불필요)
  SELECT kakao_open_chat_url INTO v_md_chat FROM users WHERE id = v_auction.md_id;
  IF v_md_chat IS NULL OR v_md_chat = '' THEN
    RETURN json_build_object('success', false, 'error', 'MD_CHAT_UNAVAILABLE');
  END IF;

  -- 기존 share_claims 행 조회 + 락 (동일 유저 두 탭 동시 클릭 방어)
  SELECT * INTO v_existing
    FROM share_claims
    WHERE auction_id = p_auction_id AND user_id = auth.uid()
    FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.cancelled_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'ALREADY_CLAIMED');
    END IF;

    -- MD 강퇴 이력 → 영구 차단
    IF v_existing.kicked_by_md = true THEN
      RETURN json_build_object('success', false, 'error', 'KICKED_BY_MD');
    END IF;

    -- 자진 취소 2회 이상 → 재참여 차단
    IF v_existing.cancellation_count >= 2 THEN
      RETURN json_build_object('success', false, 'error', 'MAX_CANCELLATIONS');
    END IF;

    -- 재참여: cancelled_at 초기화
    UPDATE share_claims
       SET cancelled_at = NULL, claimed_at = now()
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO share_claims (auction_id, user_id)
    VALUES (p_auction_id, auth.uid());
  END IF;

  -- seats_claimed 증가 + 만석 판정 (NF + 외부 합산)
  UPDATE auctions
     SET seats_claimed = seats_claimed + 1,
         status = CASE
           WHEN seats_claimed + 1 + external_attendees >= total_seats THEN 'won'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true, 'kakao_open_chat_url', v_md_chat);
END;
$$;

-- ============================================================
-- 2) cancel_share_claim
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_share_claim(p_auction_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction auctions%ROWTYPE;
BEGIN
  -- auctions 행 락
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  UPDATE share_claims
     SET cancelled_at       = now(),
         cancellation_count = cancellation_count + 1
   WHERE auction_id = p_auction_id
     AND user_id    = auth.uid()
     AND cancelled_at IS NULL;

  -- 실제로 취소된 행 없으면 좌석 감소 금지 (중복 취소 방어)
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_NOT_FOUND');
  END IF;

  UPDATE auctions
     SET seats_claimed = GREATEST(seats_claimed - 1, 0),
         -- 마감 전 + 통합 정원 미달이 되어야만 active 복귀
         status = CASE
           WHEN status = 'won'
                AND share_deadline > now()
                AND GREATEST(seats_claimed - 1, 0) + external_attendees < total_seats
           THEN 'active'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- 3) md_update_external_attendees
-- ============================================================
CREATE OR REPLACE FUNCTION md_update_external_attendees(
  p_auction_id UUID,
  p_count      INTEGER
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction auctions%ROWTYPE;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF v_auction.md_id <> auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'NOT_OWNER');
  END IF;

  IF v_auction.listing_type <> 'share' THEN
    RETURN json_build_object('success', false, 'error', 'NOT_SHARE_LISTING');
  END IF;

  IF p_count < 0 THEN
    RETURN json_build_object('success', false, 'error', 'NEGATIVE_NOT_ALLOWED');
  END IF;

  IF v_auction.seats_claimed + p_count > v_auction.total_seats THEN
    RETURN json_build_object('success', false, 'error', 'EXCEEDS_TOTAL_SEATS');
  END IF;

  UPDATE auctions
     SET external_attendees = p_count,
         status = CASE
           WHEN seats_claimed + p_count >= total_seats THEN 'won'
           WHEN status = 'won'
                AND share_deadline > now()
                AND seats_claimed + p_count < total_seats
           THEN 'active'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true, 'external_attendees', p_count);
END;
$$;

-- ============================================================
-- 4) md_kick_share_claim
-- ============================================================
CREATE OR REPLACE FUNCTION md_kick_share_claim(
  p_auction_id UUID,
  p_user_id    UUID
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction auctions%ROWTYPE;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF v_auction.md_id <> auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'NOT_OWNER');
  END IF;

  UPDATE share_claims
     SET cancelled_at       = now(),
         cancellation_count = cancellation_count + 1,
         kicked_by_md       = true
   WHERE auction_id = p_auction_id
     AND user_id    = p_user_id
     AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_NOT_FOUND');
  END IF;

  UPDATE auctions
     SET seats_claimed = GREATEST(seats_claimed - 1, 0),
         status = CASE
           WHEN status = 'won'
                AND share_deadline > now()
                AND GREATEST(seats_claimed - 1, 0) + external_attendees < total_seats
           THEN 'active'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true);
END;
$$;
