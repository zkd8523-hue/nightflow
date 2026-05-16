-- Migration 188: auctions 테이블에 성별 슬롯 추가 (조각 모드용)
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS target_male   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_female INTEGER NOT NULL DEFAULT 0;
