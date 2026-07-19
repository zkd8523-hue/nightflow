-- ============================================================
-- Migration 433: 스탬프/리워드 시스템 완전 제거
-- ------------------------------------------------------------
-- 배경: 보상(스탬프) 기반 LIVE 참여 유도는 구조적으로 약하고
--   저질 파밍을 유발. 자발적(사회적) 동기 루프로 전환하기 위해 스탬프/리워드
--   전면 폐기. (LIVE 게시 규칙 enforce_live_post_rules, 삭제 알림
--   notify_author_on_live_delete 은 스탬프 무관 → 유지)
-- 조치: 적립 트리거/함수 + 교환 RPC + 관련 테이블 전부 DROP.
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================

-- 1) 적립 트리거/함수 제거 (LIVE 게시 시 스탬프 적립)
DROP TRIGGER IF EXISTS trg_earn_stamp_on_live ON chat_shots;
DROP FUNCTION IF EXISTS earn_stamp_on_live();

-- 2) 리워드 교환/처리 RPC 제거
DROP FUNCTION IF EXISTS redeem_reward(TEXT);
DROP FUNCTION IF EXISTS fulfill_redemption(UUID, TEXT);
DROP FUNCTION IF EXISTS cancel_redemption_with_refund(UUID, TEXT);

-- 3) 스탬프 상태 뷰 제거
DROP VIEW IF EXISTS my_stamp_status CASCADE;

-- 4) 테이블 제거 (CASCADE로 FK/뷰 의존 정리)
DROP TABLE IF EXISTS reward_redemptions CASCADE;
DROP TABLE IF EXISTS reward_catalog CASCADE;
DROP TABLE IF EXISTS stamp_history CASCADE;
DROP TABLE IF EXISTS user_stamps CASCADE;
