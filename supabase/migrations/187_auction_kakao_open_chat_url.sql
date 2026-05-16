-- Migration 187: auctions 테이블에 kakao_open_chat_url 추가
-- 조각(share) 모드에서 MD가 오픈채팅 링크를 등록하면 참여자에게 공유됨

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS kakao_open_chat_url TEXT;
