-- Migration 202: 조각 인앱 참여자 성별 추적
-- 배경: claim_share_seat가 seats_claimed만 증가시키고 성별을 무시 → 슬롯 UI가 인앱 유저를 못 그림.
-- 변경: share_claims.gender 추가 + auctions.seats_claimed_male/female 카운터 추가 + RPC 재정의.

ALTER TABLE share_claims
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS seats_claimed_male   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seats_claimed_female INTEGER NOT NULL DEFAULT 0;

-- 기존 활성 claim에 gender 백필 (users.gender 기반)
UPDATE share_claims sc
   SET gender = u.gender
  FROM users u
 WHERE sc.user_id = u.id
   AND sc.gender IS NULL
   AND u.gender IS NOT NULL
   AND sc.cancelled_at IS NULL;

-- auctions 카운터 백필
UPDATE auctions a SET
  seats_claimed_male = (
    SELECT COUNT(*) FROM share_claims sc
    WHERE sc.auction_id = a.id AND sc.cancelled_at IS NULL AND sc.gender = 'male'
  ),
  seats_claimed_female = (
    SELECT COUNT(*) FROM share_claims sc
    WHERE sc.auction_id = a.id AND sc.cancelled_at IS NULL AND sc.gender = 'female'
  )
 WHERE listing_type = 'share';

-- claim_share_seat 재정의: 유저 성별을 share_claims에 기록 + auctions 카운터 증가
CREATE OR REPLACE FUNCTION claim_share_seat(p_auction_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction  auctions%ROWTYPE;
  v_existing share_claims%ROWTYPE;
  v_md_chat  TEXT;
  v_gender   TEXT;
BEGIN
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
  IF v_auction.seats_claimed + v_auction.external_attendees >= v_auction.total_seats THEN
    RETURN json_build_object('success', false, 'error', 'FULL');
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
       SET cancelled_at = NULL, claimed_at = now(), gender = v_gender
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO share_claims (auction_id, user_id, gender)
    VALUES (p_auction_id, auth.uid(), v_gender);
  END IF;

  UPDATE auctions
     SET seats_claimed = seats_claimed + 1,
         seats_claimed_male   = seats_claimed_male   + (CASE WHEN v_gender = 'male'   THEN 1 ELSE 0 END),
         seats_claimed_female = seats_claimed_female + (CASE WHEN v_gender = 'female' THEN 1 ELSE 0 END),
         status = CASE
           WHEN seats_claimed + 1 + external_attendees >= total_seats THEN 'won'
           ELSE status
         END
   WHERE id = p_auction_id;

  RETURN json_build_object('success', true, 'kakao_open_chat_url', v_md_chat);
END;
$$;

-- cancel_share_claim 재정의: 성별별 카운터도 함께 감소
CREATE OR REPLACE FUNCTION cancel_share_claim(p_auction_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gender TEXT;
BEGIN
  PERFORM 1 FROM auctions WHERE id = p_auction_id FOR UPDATE;

  SELECT gender INTO v_gender FROM share_claims
    WHERE auction_id = p_auction_id AND user_id = auth.uid() AND cancelled_at IS NULL;

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
     SET seats_claimed = GREATEST(seats_claimed - 1, 0),
         seats_claimed_male   = GREATEST(seats_claimed_male   - (CASE WHEN v_gender = 'male'   THEN 1 ELSE 0 END), 0),
         seats_claimed_female = GREATEST(seats_claimed_female - (CASE WHEN v_gender = 'female' THEN 1 ELSE 0 END), 0),
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
