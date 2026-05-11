-- Migration 156: Add music_preference column to puzzles
-- Phase 1: 한국 클럽씬 매칭 핵심 변수(힙합/EDM) 명시
-- 기존 행은 NULL로 두고, NULL = "상관없음"과 동일 취급 (필터 시 모두 통과)

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS music_preference TEXT
  CHECK (music_preference IS NULL OR music_preference IN ('hiphop', 'edm', 'any'));

COMMENT ON COLUMN puzzles.music_preference IS
  '음악 선호: hiphop | edm | any. NULL = 미지정(상관없음과 동일 취급).';
