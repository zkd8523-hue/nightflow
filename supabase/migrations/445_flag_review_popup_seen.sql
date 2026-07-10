-- 깃발 등록 직후 5자 리뷰 유도 팝업 — 계정 단위 최초 1회만 노출
-- 기존 md_onboarding_areas_seen (Migration 232) 패턴과 동일: users 셀프 UPDATE(RLS)로 기록
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS flag_review_popup_seen BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.flag_review_popup_seen
  IS '깃발 등록 후 5자 리뷰 유도 팝업 노출 완료 여부 (계정당 최초 1회, 팝업이 뜬 시점에 TRUE)';
