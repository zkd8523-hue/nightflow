-- ============================================================================
-- Migration 456: 외국인 요청 연락 채널 확장 (WeChat·LINE 추가)
--
-- 외국인은 카톡을 거의 안 씀 → 나라별 주 메신저 반영:
--   WhatsApp(글로벌)·Instagram·Email + WeChat(중국)·LINE(일본).
-- kakao/other 도 CHECK엔 남겨 하위호환(폼에선 미노출).
-- ============================================================================

ALTER TABLE foreign_requests DROP CONSTRAINT IF EXISTS foreign_requests_contact_type_check;
ALTER TABLE foreign_requests ADD CONSTRAINT foreign_requests_contact_type_check
  CHECK (contact_type IN ('whatsapp', 'instagram', 'email', 'wechat', 'line', 'kakao', 'other'));
