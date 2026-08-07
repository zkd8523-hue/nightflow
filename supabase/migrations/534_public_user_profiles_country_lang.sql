-- ============================================================================
-- Migration 534: public_user_profiles 뷰에 country_code / lang 추가 (긴급)
-- 날짜: 2026-08-07
--
-- 배경:
--   Migration 533으로 users 직접 SELECT를 막은 뒤, 홈에서 깃발/조각이 전부 사라졌다.
--   원인은 임베드 조인이다. 홈 쿼리가
--     leader:users!puzzles_leader_id_fkey!inner(...)
--   형태의 INNER 조인을 쓰는데, users 가 RLS로 막히자 조인 상대가 0행이 되어
--   깃발 행 자체가 통째로 사라졌다. (532/533 작업 때 .from("users") 호출부만 훑고
--   select 문자열 안의 임베드 조인을 놓친 것이 원인.)
--
--   임베드를 public_user_profiles 로 바꾸면 해결되는데, 홈/외국어 트랙/사이트맵이
--   테스트 계정·외국인 깃발을 걸러내는 데 country_code 와 lang 을 쓰므로
--   두 컬럼이 뷰에 있어야 한다. 둘 다 국가/언어 코드로 민감정보가 아니다.
--
-- ⚠️ 이 마이그레이션을 먼저 적용한 뒤 코드를 배포할 것.
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
  -- ── 534 추가 ──────────────────────────────────────────────────────────────
  u.country_code,             -- 외국인 깃발 필터 (hideForeignerFlags)
  u.lang                      -- 표시 언어
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;
