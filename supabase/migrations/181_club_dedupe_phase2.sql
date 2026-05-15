-- ============================================================================
-- Migration 181: 같은 (name, area) 클럽 중복 머지 (Phase 2)
-- 날짜: 2026-05-16
-- 선결 조건: Phase 1(174) + Phase 3(178) 적용 완료 — 코드/RLS가 club_partners 기반.
--
-- 목적:
--   /clubs 페이지에 같은 venue(예: "DM 라운지" x3, "레이스&사운드" x2)가
--   여러 row 로 분산 표시되는 문제 해소. 같은 (LOWER(TRIM(name)), area)
--   그룹별로 keeper 1개만 남기고 나머지는 모든 자식 FK 를 keeper 로 이전한 뒤
--   soft delete.
--
-- 처리 대상 자식 FK (information_schema 전수 조사):
--   1) auction_templates.club_id    — 단순 UPDATE
--   2) auctions.club_id             — 단순 UPDATE
--   3) club_partners.club_id        — INSERT ON CONFLICT + DELETE (UNIQUE)
--   4) puzzle_offers.club_id        — 단순 UPDATE
--   5) user_favorite_clubs.club_id  — INSERT ON CONFLICT + DELETE (UNIQUE)
--   6) users.default_club_id        — 단순 UPDATE
--
-- keeper 선택 우선순위:
--   (a) thumbnail_url IS NOT NULL 우선  (사진 보존)
--   (b) status='approved' 우선
--   (c) created_at 오래된 순 (역사 보존)
--
-- 안전망: 시작 시 모든 변경 대상 테이블을 *_backup_phase2 로 복제.
-- 실수 발견 시 backup 테이블로 복구 가능.
-- ============================================================================

BEGIN;

-- ===================== 1. 백업 (Pro plan snapshot 없을 때 안전망) =====================
DROP TABLE IF EXISTS clubs_backup_phase2;
DROP TABLE IF EXISTS club_partners_backup_phase2;
DROP TABLE IF EXISTS auctions_clubid_backup_phase2;
DROP TABLE IF EXISTS auction_templates_clubid_backup_phase2;
DROP TABLE IF EXISTS puzzle_offers_clubid_backup_phase2;
DROP TABLE IF EXISTS user_favorite_clubs_backup_phase2;
DROP TABLE IF EXISTS users_default_club_backup_phase2;

CREATE TABLE clubs_backup_phase2 AS SELECT * FROM clubs;
CREATE TABLE club_partners_backup_phase2 AS SELECT * FROM club_partners;
CREATE TABLE auctions_clubid_backup_phase2 AS
  SELECT id, club_id FROM auctions;
CREATE TABLE auction_templates_clubid_backup_phase2 AS
  SELECT id, club_id FROM auction_templates;
CREATE TABLE puzzle_offers_clubid_backup_phase2 AS
  SELECT id, club_id FROM puzzle_offers;
CREATE TABLE user_favorite_clubs_backup_phase2 AS
  SELECT * FROM user_favorite_clubs;
CREATE TABLE users_default_club_backup_phase2 AS
  SELECT id, default_club_id FROM users WHERE default_club_id IS NOT NULL;

-- 백업 테이블 RLS enable (정책 미선언 → anon/authenticated 접근 차단,
-- service_role 만 접근 가능. 백업은 1~2주 안정화 후 DROP 예정)
ALTER TABLE clubs_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_partners_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions_clubid_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_templates_clubid_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_offers_clubid_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorite_clubs_backup_phase2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_default_club_backup_phase2 ENABLE ROW LEVEL SECURITY;

-- ===================== 2. keeper / dup 매핑 임시 테이블 =====================
DROP TABLE IF EXISTS _phase2_keeper_pairs;
CREATE TEMP TABLE _phase2_keeper_pairs AS
WITH groups AS (
  SELECT
    LOWER(TRIM(name)) AS norm_name,
    area,
    array_agg(id ORDER BY
      (thumbnail_url IS NOT NULL) DESC,
      (status = 'approved') DESC,
      created_at ASC
    ) AS ids
  FROM clubs
  WHERE deleted_at IS NULL
  GROUP BY LOWER(TRIM(name)), area
  HAVING COUNT(*) > 1
)
SELECT ids[1] AS keeper_id, unnest(ids[2:]) AS dup_id
FROM groups;

-- ===================== 3. 자식 FK 이전 =====================

-- 3-1. auction_templates.club_id (단순 UPDATE — 유니크 제약 없음)
UPDATE auction_templates at SET club_id = kp.keeper_id
FROM _phase2_keeper_pairs kp WHERE at.club_id = kp.dup_id;

-- 3-2. auctions.club_id (단순 UPDATE)
UPDATE auctions a SET club_id = kp.keeper_id
FROM _phase2_keeper_pairs kp WHERE a.club_id = kp.dup_id;

-- 3-3. puzzle_offers.club_id (단순 UPDATE)
UPDATE puzzle_offers po SET club_id = kp.keeper_id
FROM _phase2_keeper_pairs kp WHERE po.club_id = kp.dup_id;

-- 3-4. users.default_club_id (단순 UPDATE)
UPDATE users u SET default_club_id = kp.keeper_id
FROM _phase2_keeper_pairs kp WHERE u.default_club_id = kp.dup_id;

-- 3-5. club_partners (UNIQUE (club_id, md_id) — INSERT ON CONFLICT + DELETE)
INSERT INTO club_partners (club_id, md_id, role, joined_at)
SELECT kp.keeper_id, cp.md_id, cp.role, cp.joined_at
FROM club_partners cp
JOIN _phase2_keeper_pairs kp ON cp.club_id = kp.dup_id
ON CONFLICT (club_id, md_id) DO NOTHING;

DELETE FROM club_partners cp
USING _phase2_keeper_pairs kp
WHERE cp.club_id = kp.dup_id;

-- 3-6. user_favorite_clubs (UNIQUE (user_id, club_id) — INSERT ON CONFLICT + DELETE)
INSERT INTO user_favorite_clubs (user_id, club_id)
SELECT ufc.user_id, kp.keeper_id
FROM user_favorite_clubs ufc
JOIN _phase2_keeper_pairs kp ON ufc.club_id = kp.dup_id
ON CONFLICT (user_id, club_id) DO NOTHING;

DELETE FROM user_favorite_clubs ufc
USING _phase2_keeper_pairs kp
WHERE ufc.club_id = kp.dup_id;

-- ===================== 4. dup 클럽 soft delete (자식 데이터 이관 완료 후) =====================
UPDATE clubs c
SET deleted_at = now(),
    deleted_by = NULL  -- 시스템 머지 (admin user 가 아님)
FROM _phase2_keeper_pairs kp
WHERE c.id = kp.dup_id
  AND c.deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================================
-- (1) 같은 (name, area) 활성 중복 0건 이어야 정상
--   SELECT LOWER(TRIM(name)), area, COUNT(*)
--   FROM clubs WHERE deleted_at IS NULL
--   GROUP BY LOWER(TRIM(name)), area HAVING COUNT(*) > 1;
--
-- (2) auctions club_id 끊김 (active/scheduled 만 — 과거 won/unsold 는 무관)
--   SELECT a.id, a.club_id FROM auctions a
--   JOIN clubs c ON c.id = a.club_id
--   WHERE c.deleted_at IS NOT NULL
--     AND a.status IN ('active','scheduled');
--
-- (3) users.default_club_id 끊김
--   SELECT u.id FROM users u
--   JOIN clubs c ON c.id = u.default_club_id
--   WHERE c.deleted_at IS NOT NULL;
--
-- (4) active MD 인데 club_partners 0
--   SELECT u.id FROM users u
--   WHERE u.md_status='approved' AND u.deleted_at IS NULL
--     AND NOT EXISTS (SELECT 1 FROM club_partners cp WHERE cp.md_id = u.id);
--
-- (5) thumbnail 보존 (전후 카운트 비교)
--   SELECT COUNT(*) FROM clubs WHERE thumbnail_url IS NOT NULL AND deleted_at IS NULL;
--   SELECT COUNT(*) FROM clubs_backup_phase2 WHERE thumbnail_url IS NOT NULL AND deleted_at IS NULL;
--
-- 모든 검증 통과 + 1~2주 안정화 후 백업 테이블 정리:
--   DROP TABLE clubs_backup_phase2, club_partners_backup_phase2,
--              auctions_clubid_backup_phase2, auction_templates_clubid_backup_phase2,
--              puzzle_offers_clubid_backup_phase2, user_favorite_clubs_backup_phase2,
--              users_default_club_backup_phase2;
