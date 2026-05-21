-- ============================================================================
-- Migration 210: 조각 일행 합류 (party_size)
-- 날짜: 2026-05-21
-- 설명:
--   - 한 번에 최대 3명까지 함께 참여 가능 (본인 + 일행 2명)
--   - share_claims.party_size 추가 (default 1)
--   - claim_share_seat(p_auction_id, p_party_size) 재정의
--   - cancel_share_claim 재정의: 저장된 party_size 만큼 감소
--   - 성별 카운터는 본인 성별로 party_size 만큼 가산 (현장 정정은 MD external 입력으로 보정)
-- ============================================================================

ALTER TABLE share_claims
  ADD COLUMN IF NOT EXISTS party_size INTEGER NOT NULL DEFAULT 1
    CHECK (party_size BETWEEN 1 AND 3);

CREATE OR REPLACE FUNCTION claim_share_seat(
  p_auction_id UUID,
  p_party_size INTEGER DEFAULT 1
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction  auctions%ROWTYPE;
  v_existing share_claims%ROWTYPE;
  v_md_chat  TEXT;
  v_gender   TEXT;
  v_party    INTEGER;
  v_seats_left INTEGER;
BEGIN
  v_party := COALESCE(p_party_size, 1);
  IF v_party < 1 OR v_party > 3 THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_PARTY_SIZE');
  END IF;

  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

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

  v_seats_left := v_auction.total_seats
                  - v_auction.seats_claimed
                  - v_auction.external_attendees;

  IF v_seats_left <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'FULL');
  END IF;
  IF v_party > v_seats_left THEN
    RETURN json_build_object('success', false, 'error', 'EXCEEDS_TOTAL_SEATS');
  END IF;

  SELECT kakao_open_chat_url INTO v_md_chat FROM users WHERE id = v_auction.md_id;
  IF v_md_chat IS NULL OR v_md_chat = '' THEN
    RETURN json_build_object('success', false, 'error', 'MD_CHAT_UNAVAILABLE');
  END IF;

  SELECT gender INTO v_gender FROM users WHERE id = auth.uid();

  SELECT * INTO v_existing FROM share_claims
    WHERE auction_id = p_auction_id AND user_id = auth.uid()
    FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.cancelled_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'ALREADY_CLAIMED');
    END IF;
    IF v_existing.kicked_by_md = true THEN
      RETURN json_build_object('success', false, 'error', 'KICKED_BY_MD');
    END IF;
    IF v_existing.cancellation_count >= 2 THEN
      RETURN json_build_object('success', false, 'error', 'MAX_CANCELLATIONS');
    END IF;
    UPDATE share_claims
       SET cancelled_at = NULL,
           claimed_at = now(),
           gender = v_gender,
           party_size = v_party
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO share_claims (auction_id, user_id, gender, party_size)
    VALUES (p_auction_id, auth.uid(), v_gender, v_party);
  END IF;

  UPDATE auctions
     SET seats_claimed = seats_claimed + v_party,
         seats_claimed_male   = seats_claimed_male   + (CASE WHEN v_gender = 'male'   THEN v_party ELSE 0 END),
         seats_claimed_female = seats_claimed_female + (CASE WHEN v_gender = 'female' THEN v_party ELSE 0 END),
         status = CASE
           WHEN seats_claimed + v_party + external_attendees >= total_seats THEN 'won'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object(
    'success', true,
    'kakao_open_chat_url', v_md_chat,
    'party_size', v_party
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_share_claim(p_auction_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gender TEXT;
  v_party  INTEGER;
BEGIN
  PERFORM 1 FROM auctions WHERE id = p_auction_id FOR UPDATE;

  SELECT gender, party_size INTO v_gender, v_party
    FROM share_claims
   WHERE auction_id = p_auction_id
     AND user_id    = auth.uid()
     AND cancelled_at IS NULL;

  v_party := COALESCE(v_party, 1);

  UPDATE share_claims
     SET cancelled_at       = now(),
         cancellation_count = cancellation_count + 1
   WHERE auction_id = p_auction_id
     AND user_id    = auth.uid()
     AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'CLAIM_NOT_FOUND');
  END IF;

  UPDATE auctions
     SET seats_claimed = GREATEST(seats_claimed - v_party, 0),
         seats_claimed_male   = GREATEST(seats_claimed_male   - (CASE WHEN v_gender = 'male'   THEN v_party ELSE 0 END), 0),
         seats_claimed_female = GREATEST(seats_claimed_female - (CASE WHEN v_gender = 'female' THEN v_party ELSE 0 END), 0),
         status = CASE
           WHEN status = 'won'
                AND share_deadline > now()
                AND GREATEST(seats_claimed - v_party, 0) + external_attendees < total_seats
           THEN 'active'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true);
END;
$$;
