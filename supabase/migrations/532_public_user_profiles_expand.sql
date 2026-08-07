-- ============================================================================
-- Migration 532: public_user_profiles 뷰 확장 (users 직접 조회 제거 준비)
-- 날짜: 2026-08-07
-- 배경:
--   Migration 109가 users 직접 SELECT를 본인/MD(입찰자)/admin 으로 제한하려 했으나
--   프로덕션에 반영되지 않아, 익명 키로 users 의 phone/name/email/kakao_id 가
--   그대로 조회되는 상태다. 실제로 익명 요청으로 전화번호 값이 반환되는 것을 확인했다.
--
--   정책을 바로 조이면 남의 프로필을 읽는 화면 9곳이 조용히 빈 결과(null)로 죽는다.
--   (RLS 차단은 에러가 아니라 0행이라 로그에도 안 남는다.)
--   그래서 "뷰 확장 → 코드 교체 → 정책 조이기" 순서로 나눈다. 본 마이그레이션은 1단계.
--
-- 변경:
--   1) 화면이 실제로 쓰는 공개 컬럼 13개를 뷰 끝에 추가 (기존 컬럼 순서/타입 불변 →
--      CREATE OR REPLACE 가능, 의존 객체 영향 없음)
--   2) instagram / kakao_open_chat_url 노출 조건을 'MD' → 'MD 또는 contact_public'
--      으로 확대. 일반 유저 공개 프로필의 연락처 opt-in 노출(Migration 448,
--      PublicProfileView 의 contact_public 분기)이 뷰 전환 후에도 살아있어야 한다.
--
-- 비공개 유지: name(실명), phone(MD 제외), email, kakao_id, ci, di, referral_code
-- 다음 단계: Migration 533 (users RLS 조이기) — 코드 배포 완료 후 적용할 것
-- ============================================================================

CREATE OR REPLACE VIEW public_user_profiles AS
SELECT
  -- ── 기존 컬럼 (순서/이름/타입 유지) ────────────────────────────────────────
  u.id,
  u.display_name,
  u.profile_image,
  u.role,
  u.md_unique_slug,
  u.md_customer_grade,
  u.is_reviewer,
  u.deal_count_total,
  u.deal_amount_total,
  -- MD는 상시 공개, 일반 유저는 본인이 켠 경우(contact_public)만 공개
  CASE WHEN u.role = 'md' OR u.contact_public THEN u.instagram END AS instagram,
  CASE WHEN u.role = 'md' OR u.contact_public THEN u.kakao_open_chat_url END AS kakao_open_chat_url,
  CASE WHEN u.role = 'md' THEN u.preferred_contact_methods END AS preferred_contact_methods,
  CASE WHEN u.role = 'md' THEN u.phone END AS phone,
  CASE WHEN u.role = 'md' THEN u.deal_count_total END AS md_deal_count,
  -- ── 추가 컬럼 ─────────────────────────────────────────────────────────────
  u.bio,                      -- 공개 프로필 자기소개 (Migration 279)
  u.created_at,               -- 가입일 → 신규 유저 배지
  u.updated_at,               -- sitemap lastModified
  u.md_status,                -- 승인 MD 판별 (공개 프로필 / sitemap)
  u.area,                     -- MD 활동 지역 (Migration 011)
  u.gender,                   -- 깃발 방장 표시
  u.last_seen_at,             -- 최근 접속 배지 (Migration 201)
  u.is_test,                  -- 테스트 계정 제외 필터 (Migration 301)
  u.contact_public,           -- 연락처 공개 여부 자체 (Migration 448)
  u.md_avg_rating,
  u.md_review_count,
  u.preferred_music_genres,   -- 공개 프로필 취향 (Migration 280)
  u.preferred_areas
FROM users u
WHERE u.deleted_at IS NULL;

GRANT SELECT ON public_user_profiles TO anon, authenticated;

COMMENT ON VIEW public_user_profiles IS
  '익명/일반 유저 대상 공개 프로필. 실명(name)·전화번호(일반 유저)·이메일·kakao_id·ci/di·referral_code 제외. 연락처는 MD 상시, 일반 유저는 contact_public opt-in 시 공개.';
