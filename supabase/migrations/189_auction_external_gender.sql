-- Migration 189: 조각 확정 인원 성별 분리
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS external_male   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_female INTEGER NOT NULL DEFAULT 0;
