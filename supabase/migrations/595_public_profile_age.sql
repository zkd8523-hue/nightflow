-- ============================================================================
-- Migration 595: public_user_profiles 뷰에 나이(age) 추가
-- 날짜: 2026-08-28
-- 배경:
--   파티(조각) 참여자 목록에 나이·성별을 표시하기로 했다(성별 제한/연령 제한이
--   실제 참가 제한이 된 김에, Migration 594) — 참가자 서로가 조건에 맞는지
--   확인할 수 있어야 하기 때문이다.
--
--   users.birthday는 생년월일 전체라 그대로 노출하면 과한 개인정보다.
--   화면에 필요한 건 "나이" 뿐이므로, 뷰에는 계산된 정수 나이만 추가하고
--   생년월일 원본은 여전히 노출하지 않는다.
-- ============================================================================

CREATE OR REPLACE VIEW public_user_profiles AS
SELECT
  u.id,
  u.display_name,
  u.profile_image,
  u.role,
  u.md_unique_slug,
  u.md_customer_grade,
  u.is_reviewer,
  u.deal_count_total,
  u.deal_amount_total,
  CASE WHEN u.role = 'md' OR u.contact_public THEN u.instagram END AS instagram,
  CASE WHEN u.role = 'md' OR u.contact_public THEN u.kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN u.role = 'md' THEN u.preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN u.role = 'md' THEN u.phone END AS phone,
  CASE WHEN u.role = 'md' THEN u.deal_count_total END AS md_deal_count,
  u.bio,
  u.created_at,
  u.updated_at,
  u.md_status,
  u.area,
  u.gender,
  u.last_seen_at,
  u.is_test,
  u.contact_public,
  u.md_avg_rating,
  u.md_review_count,
  u.preferred_music_genres,
  u.preferred_areas,
  u.country_code,
  u.lang,
  -- ── 595 추가 ──────────────────────────────────────────────────────────────
  -- 생년월일 원본은 노출하지 않고 계산된 나이만. 파티 참여자 목록 표시용.
  CASE WHEN u.birthday IS NOT NULL THEN EXTRACT(YEAR FROM age(u.birthday))::INT END AS age
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;
