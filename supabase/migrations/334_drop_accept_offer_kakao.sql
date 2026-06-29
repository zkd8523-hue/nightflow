-- ============================================================================
-- Migration 334: 깃발 오퍼 수락에서 방장 카카오 오픈챗 등록 제거
-- 날짜: 2026-06-29
-- 설명:
--   인앱 1:1 채팅(Migration 332)이 도입되어, 방장이 수락 시 자기 카카오
--   오픈챗을 등록받던 흐름이 불필요해짐.
--
--   문제: Migration 139의 accept_offer(UUID, TEXT DEFAULT NULL) [2-arg, 카카오 등록]가
--   살아있어, 클라이언트가 2-arg로 호출하면 Migration 333(채팅 과금, 1-arg)이 적용되지 않음.
--   또 1-arg 호출은 (UUID) vs (UUID, TEXT DEFAULT NULL) 모호성으로 충돌함.
--
--   해결: 2-arg 버전을 제거 → 333의 1-arg accept_offer(p_offer_id)만 남김.
--   이후 모든 수락은 1-arg로 호출되어 채팅 과금 로직이 정상 적용된다.
--
--   ※ MD의 연락처(MDContactCard, offer.md.kakao_open_chat_url)는 그대로 유지.
--     제거 대상은 "방장이 등록하는 puzzle.kakao_open_chat_url" 흐름뿐.
-- ============================================================================

DROP FUNCTION IF EXISTS accept_offer(UUID, TEXT);
