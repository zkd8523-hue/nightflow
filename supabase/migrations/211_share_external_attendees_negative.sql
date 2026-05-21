-- Migration 211: 외부 모집 인원 차감 허용 (인원 이탈 반영)
--
-- 배경:
--   조각(share) 카드의 외부 모집 스테퍼에서 - 버튼이 0에서 잠겼음.
--   현장에서 모집했던 외부 인원이 빠지는 경우(취소/노쇼)에도
--   MD가 즉시 반영할 수 있도록 external_attendees 음수 저장을 허용.
--
-- 변경:
--   share_combined_seats_within_total 의 external_attendees >= 0 하한 제거.
--   상한(seats_claimed + external_attendees <= total_seats)은 유지.
--   대신 seats_claimed + external_attendees >= 0 으로 총 인원 음수 방지.

ALTER TABLE auctions DROP CONSTRAINT IF EXISTS share_combined_seats_within_total;
ALTER TABLE auctions ADD CONSTRAINT share_combined_seats_within_total
  CHECK (
    listing_type <> 'share' OR (
      seats_claimed + external_attendees <= total_seats
      AND seats_claimed + external_attendees >= 0
    )
  );
