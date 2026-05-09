-- ============================================
-- Migration 144: check_club_limit에서 soft-deleted 클럽 제외
-- ============================================
-- 배경: Migration 143에서 clubs.deleted_at 도입.
--       Migration 121의 check_club_limit() 트리거는 deleted_at 조건이 없어
--       삭제된 클럽도 한도(3개)에 포함됨 → UI는 0개로 보이는데 등록 시 한도 초과 에러.
-- ============================================

CREATE OR REPLACE FUNCTION check_club_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM clubs
    WHERE md_id = NEW.md_id
      AND deleted_at IS NULL
  ) >= 3 THEN
    RAISE EXCEPTION '클럽은 최대 3개까지 등록할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
