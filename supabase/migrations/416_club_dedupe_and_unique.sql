-- ============================================================================
-- Migration 416: 클럽 중복 근본 정리 + (LOWER(TRIM(name)), area) UNIQUE 인덱스
-- 날짜: 2026-07-07
-- 목적:
--   1) 정규화명(LOWER(TRIM(name)))+area가 같은 is_test=false 클럽을 자동 병합
--      (keeper = 이미지>좌표>승인>오래된 순, 프론트 ClubList dedup 규칙과 일치).
--      자식 FK를 전수 이관(단순 UPDATE / UNIQUE는 충돌회피 이관) 후 dup soft-delete.
--   2) 재발 차단용 partial UNIQUE 인덱스.
-- 실행: Supabase 대시보드 SQL Editor에 통째로 1회 붙여넣기 (service_role, RLS 우회).
--       db push 금지. 반드시 _diagnostic_club_dups.sql 먼저 확인 후 실행.
-- 안전장치: 백업 테이블 + 단일 트랜잭션 + 병합 후 잔존중복 프리체크(있으면 전체 롤백).
-- 하드코딩 없음: 정규화명 그룹으로 keeper/dup을 스크립트가 자동 결정.
-- ============================================================================
BEGIN;

-- ===== 0. 백업 (문제 시 복구용) =====
DROP TABLE IF EXISTS clubs_backup_416;
CREATE TABLE clubs_backup_416 AS SELECT * FROM clubs;

-- ===== 1. keeper/dup 매핑 (is_test=false, 미삭제만) =====
DROP TABLE IF EXISTS _pairs_416;
CREATE TEMP TABLE _pairs_416 AS
WITH groups AS (
  SELECT array_agg(id ORDER BY
           (thumbnail_url IS NOT NULL) DESC,  -- 이미지 우선 (프론트 규칙)
           (latitude IS NOT NULL)     DESC,   -- 좌표 우선 (지도 핀 보존)
           (status = 'approved')      DESC,   -- 승인 우선
           created_at ASC                     -- 오래된 우선
         ) AS ids
  FROM clubs
  WHERE deleted_at IS NULL AND is_test = false
  GROUP BY LOWER(TRIM(name)), COALESCE(area,'')
  HAVING COUNT(*) > 1
)
SELECT ids[1] AS keeper_id, unnest(ids[2:]) AS dup_id FROM groups;

-- ===== 2. 자식 FK 이관 헬퍼 =====
-- (A) 단순 UPDATE: 테이블/컬럼 존재할 때만 실행 (스키마 드리프트 방어)
CREATE OR REPLACE FUNCTION _mv_plain_416(p_tbl text, p_col text) RETURNS void AS $fn$
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name=p_tbl AND column_name=p_col) THEN RETURN; END IF;
  EXECUTE format(
    'UPDATE %I t SET %I = p.keeper_id FROM _pairs_416 p WHERE t.%I = p.dup_id',
    p_tbl, p_col, p_col);
END $fn$ LANGUAGE plpgsql;

-- (B) UNIQUE(col, other) 보유: keeper에 같은 키 없을 때만 옮기고, 남은(충돌) dup행은 삭제
CREATE OR REPLACE FUNCTION _mv_guarded_416(p_tbl text, p_other text) RETURNS void AS $fn$
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name=p_tbl AND column_name='club_id')  THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name=p_tbl AND column_name=p_other)    THEN RETURN; END IF;
  EXECUTE format(
    'UPDATE %1$I t SET club_id = p.keeper_id FROM _pairs_416 p
       WHERE t.club_id = p.dup_id
         AND NOT EXISTS (SELECT 1 FROM %1$I k WHERE k.club_id = p.keeper_id AND k.%2$I = t.%2$I)',
    p_tbl, p_other);
  EXECUTE format(
    'DELETE FROM %1$I t USING _pairs_416 p WHERE t.club_id = p.dup_id', p_tbl);
END $fn$ LANGUAGE plpgsql;

-- (A) 단순 UPDATE 부류 --------------------------------------------------------
SELECT _mv_plain_416('auctions',                   'club_id');
SELECT _mv_plain_416('auction_templates',          'club_id');
SELECT _mv_plain_416('puzzle_offers',              'club_id');
SELECT _mv_plain_416('puzzles',                    'club_id');
SELECT _mv_plain_416('puzzle_reviews',             'club_id');
SELECT _mv_plain_416('daily_hotdeals',             'club_id');
SELECT _mv_plain_416('hotdeal_templates',          'club_id');
SELECT _mv_plain_416('hotdeal_slot_contact_clicks','club_id');
SELECT _mv_plain_416('chat_shots',                 'club_id');
SELECT _mv_plain_416('share_options',              'club_id');
-- ⚠️ club_reviews/club_one_liners에 UNIQUE(club_id, user/md)가 있으면 (진단쿼리 3 확인)
--    plain은 같은 유저가 keeper+dup 둘 다 리뷰했을 때 23505로 롤백됨 → 그 경우 아래 B로 옮길 것.
SELECT _mv_plain_416('club_reviews',               'club_id');
SELECT _mv_plain_416('club_one_liners',            'club_id');
SELECT _mv_plain_416('one_liner_reports',          'club_id');
SELECT _mv_plain_416('club_info_reports',          'club_id');
SELECT _mv_plain_416('club_change_log',            'club_id');
SELECT _mv_plain_416('payment_escrow',             'club_id');
SELECT _mv_plain_416('search_misses',              'resolved_alias_for');
SELECT _mv_plain_416('users',                      'default_club_id');

-- (B) UNIQUE(club_id, other) 부류 — 충돌회피 이관 ----------------------------
SELECT _mv_guarded_416('club_partners',      'md_id');
SELECT _mv_guarded_416('user_favorite_clubs','user_id');
SELECT _mv_guarded_416('user_pinned_clubs',  'user_id');
SELECT _mv_guarded_416('weekly_hotdeal_slots','slot_date');
SELECT _mv_guarded_416('weekly_share_slots', 'week_start');
SELECT _mv_guarded_416('share_weekday_plan', 'weekday');
SELECT _mv_guarded_416('club_word_clouds',   'author');

-- ===== 3. dup 클럽 soft-delete =====
UPDATE clubs c SET deleted_at = now()
FROM _pairs_416 p
WHERE c.id = p.dup_id AND c.deleted_at IS NULL;

-- ===== 4. 병합 후 잔존 중복 프리체크 (있으면 전체 롤백) =====
DO $$
DECLARE v_cnt INT;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM (
    SELECT 1 FROM clubs
    WHERE deleted_at IS NULL AND is_test = false
    GROUP BY LOWER(TRIM(name)), COALESCE(area,'')
    HAVING COUNT(*) > 1
  ) x;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '병합 후에도 is_test=false 중복 % 그룹 잔존 — 인덱스 생성 중단(전체 롤백)', v_cnt;
  END IF;
END $$;

-- ===== 5. partial UNIQUE 인덱스 (재발 차단) =====
-- 정규화 수준: LOWER(TRIM(name))만. "club" 접두/접미 제거는 별개 venue 오병합 위험이라
-- DB에선 적용하지 않음 (프론트 dedup의 소프트 레이어로만 유지).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clubs_name_area_active
  ON clubs (LOWER(TRIM(name)), COALESCE(area,''))
  WHERE deleted_at IS NULL AND is_test = false;

-- ===== 6. 헬퍼 정리 =====
DROP FUNCTION IF EXISTS _mv_plain_416(text, text);
DROP FUNCTION IF EXISTS _mv_guarded_416(text, text);

COMMIT;

-- ============================================================================
-- 적용 후 검증 (0행이어야 정상):
--   SELECT LOWER(TRIM(name)), area, COUNT(*) FROM clubs
--     WHERE deleted_at IS NULL AND is_test=false GROUP BY 1,2 HAVING COUNT(*)>1;
--   SELECT a.id FROM auctions a JOIN clubs c ON c.id=a.club_id
--     WHERE c.deleted_at IS NOT NULL AND a.status IN ('active','scheduled');
-- 복구가 필요하면: clubs_backup_416 로 원복. 확인 끝나면 DROP TABLE clubs_backup_416;
-- ============================================================================
