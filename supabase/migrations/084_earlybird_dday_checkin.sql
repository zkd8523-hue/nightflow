-- Migration: Add D-Day Checked In flag for Early Bird tracking

ALTER TABLE public.auctions
ADD COLUMN d_day_checked_in BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.auctions.d_day_checked_in IS '얼리버드 예약건에 대한 D-Day(방문 당일) 유저 방문 재확인 완료 여부';
