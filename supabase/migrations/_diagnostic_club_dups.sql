-- ============================================================================
-- 진단 전용 (읽기): Migration 416 적용 전에 Supabase SQL Editor에서 먼저 실행.
-- anon(실유저 뷰)에는 안 보이는 pending/미승인 중복까지 service_role로 전부 확인.
-- 파일명 언더스코어(_) 접두 = 마이그레이션 러너가 건너뜀. 수동 실행용.
-- ============================================================================

-- (1) is_test=false 정규화명 중복 그룹 — 416이 병합할 대상 전체
SELECT LOWER(TRIM(name)) AS norm_name,
       COALESCE(area,'')  AS area,
       COUNT(*)           AS n,
       array_agg(id ORDER BY (thumbnail_url IS NOT NULL) DESC,
                              (latitude IS NOT NULL) DESC,
                              (status='approved') DESC,
                              created_at ASC) AS ids_keeper_first,
       array_agg(name)    AS names,
       array_agg(status)  AS statuses
FROM clubs
WHERE deleted_at IS NULL AND is_test = false
GROUP BY LOWER(TRIM(name)), COALESCE(area,'')
HAVING COUNT(*) > 1
ORDER BY n DESC;

-- (2) clubs(id)를 참조하는 모든 자식 FK 컬럼 — 416의 이관 대상 목록과 대조
SELECT tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc  ON tc.constraint_name  = rc.constraint_name
JOIN information_schema.key_column_usage  kcu ON kcu.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name
WHERE ccu.table_name = 'clubs' AND ccu.column_name = 'id'
ORDER BY tc.table_name;

-- (3) 그 중 club_id가 UNIQUE 제약에 포함된 테이블 (416의 B부류 = 충돌회피 이관 필요)
SELECT tc.table_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS unique_cols
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.constraint_name IN (
    SELECT constraint_name FROM information_schema.key_column_usage WHERE column_name = 'club_id'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;
