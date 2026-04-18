-- Migration 119: public_user_profiles에 md_deal_count 추가
-- MD 거래 횟수(contacted + confirmed)를 공개 프로필에 노출
-- 기존 md_customer_grade 등급 시스템 대신 거래 횟수 숫자를 직접 표시

CREATE OR REPLACE VIEW public_user_profiles AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.role,
  u.md_unique_slug,
  u.md_customer_grade,
  u.is_reviewer,
  CASE WHEN u.role = 'md' THEN u.instagram END AS instagram,
  CASE WHEN u.role = 'md' THEN u.kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN u.role = 'md' THEN u.preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN u.role = 'md' THEN u.phone END AS phone,
  CASE WHEN u.role = 'md' THEN (
    SELECT COUNT(*)::INTEGER FROM auctions a
    WHERE a.md_id = u.id AND a.status IN ('contacted', 'confirmed')
  ) END AS md_deal_count
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;
