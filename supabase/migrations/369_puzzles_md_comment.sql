-- ============================================================================
-- Migration 369: puzzles.md_comment 추가 (MD 직통 조각 — MD 한마디)
-- 날짜: 2026-07-06
-- 설명:
--   MD 직통 조각(host_is_md) 등록 폼에 "MD 한마디"(최대 200자, 자유 텍스트) 입력칸 신설.
--   AuctionForm이 puzzles.insert/update 시 md_comment를 저장하려 하는데 컬럼이 없어 누락되고 있었음.
--   (참고: auctions.md_comment는 132에서 이미 15자 제한으로 추가됨 — 별개 컬럼)
-- ============================================================================
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS md_comment VARCHAR(200);
