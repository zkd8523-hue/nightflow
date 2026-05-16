-- ============================================================================
-- Migration 184: 퍼즐 성별 슬롯 분리
-- 날짜: 2026-05-16
--
-- 변경:
--   1) puzzles에 target_male/target_female, current_male/current_female 컬럼 추가
--   2) puzzle_members에 gender 스냅샷 컬럼 추가 (users.gender에서 복사)
--   3) puzzle_members INSERT/DELETE 트리거: current_male/female 자동 갱신
--   4) 기존 데이터 보수적 백필
--
-- 정책:
--   - target_male + target_female = target_count (코드/RPC에서 보장)
--   - 멤버의 guest_count는 본인과 동성으로 가정
--   - 기존 gender_pref는 당분간 유지 (deprecate 예정)
-- ============================================================================

-- 1. puzzles 컬럼 추가
ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS target_male   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_female INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_male   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_female INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN puzzles.target_male   IS '남자 슬롯 목표 인원 (방장 본인 포함, target_male + target_female = target_count)';
COMMENT ON COLUMN puzzles.target_female IS '여자 슬롯 목표 인원';
COMMENT ON COLUMN puzzles.current_male   IS '현재 채워진 남자 슬롯 (guest_count 포함, 본인과 동성으로 가정)';
COMMENT ON COLUMN puzzles.current_female IS '현재 채워진 여자 슬롯';

-- 2. puzzle_members.gender 스냅샷 컬럼
ALTER TABLE puzzle_members
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));

COMMENT ON COLUMN puzzle_members.gender IS '합류 시점 users.gender 스냅샷. guest_count도 동성으로 카운트.';

-- 3. 기존 데이터 백필
--    gender_pref 기반으로 타겟 슬롯 보수적 매핑
UPDATE puzzles
SET target_male   = CASE WHEN gender_pref = 'female_only' THEN 0 ELSE target_count END,
    target_female = CASE WHEN gender_pref = 'female_only' THEN target_count ELSE 0 END
WHERE target_male = 0 AND target_female = 0;

--    puzzle_members.gender 백필: users.gender에서 복사 (없으면 puzzle의 gender_pref로 추정)
UPDATE puzzle_members pm
SET gender = CASE
  WHEN u.gender IS NOT NULL THEN u.gender
  WHEN p.gender_pref = 'female_only' THEN 'female'
  ELSE 'male'
END
FROM users u, puzzles p
WHERE pm.user_id = u.id AND pm.puzzle_id = p.id AND pm.gender IS NULL;

--    current_male/female 집계 백필
WITH gender_counts AS (
  SELECT
    puzzle_id,
    SUM(CASE WHEN gender = 'male'   THEN 1 + COALESCE(guest_count, 0) ELSE 0 END) AS male_total,
    SUM(CASE WHEN gender = 'female' THEN 1 + COALESCE(guest_count, 0) ELSE 0 END) AS female_total
  FROM puzzle_members
  GROUP BY puzzle_id
)
UPDATE puzzles p
SET current_male   = COALESCE(gc.male_total, 0),
    current_female = COALESCE(gc.female_total, 0)
FROM gender_counts gc
WHERE gc.puzzle_id = p.id;

-- 4. 멤버 INSERT/DELETE 트리거 — current_male/female 자동 갱신
CREATE OR REPLACE FUNCTION sync_puzzle_gender_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_gender TEXT;
  v_total INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- gender 스냅샷이 비어있으면 users.gender에서 채움
    IF NEW.gender IS NULL THEN
      SELECT gender INTO v_gender FROM users WHERE id = NEW.user_id;
      NEW.gender := v_gender;
    END IF;

    v_total := 1 + COALESCE(NEW.guest_count, 0);
    IF NEW.gender = 'male' THEN
      UPDATE puzzles SET current_male = current_male + v_total WHERE id = NEW.puzzle_id;
    ELSIF NEW.gender = 'female' THEN
      UPDATE puzzles SET current_female = current_female + v_total WHERE id = NEW.puzzle_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_total := 1 + COALESCE(OLD.guest_count, 0);
    IF OLD.gender = 'male' THEN
      UPDATE puzzles SET current_male = GREATEST(current_male - v_total, 0) WHERE id = OLD.puzzle_id;
    ELSIF OLD.gender = 'female' THEN
      UPDATE puzzles SET current_female = GREATEST(current_female - v_total, 0) WHERE id = OLD.puzzle_id;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- guest_count 변경 대응 (gender는 변경 불가하므로 같다고 가정)
    IF NEW.guest_count IS DISTINCT FROM OLD.guest_count AND NEW.gender = OLD.gender THEN
      v_total := COALESCE(NEW.guest_count, 0) - COALESCE(OLD.guest_count, 0);
      IF NEW.gender = 'male' THEN
        UPDATE puzzles SET current_male = GREATEST(current_male + v_total, 0) WHERE id = NEW.puzzle_id;
      ELSIF NEW.gender = 'female' THEN
        UPDATE puzzles SET current_female = GREATEST(current_female + v_total, 0) WHERE id = NEW.puzzle_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_puzzle_members_gender_sync ON puzzle_members;

CREATE TRIGGER trg_puzzle_members_gender_sync
  BEFORE INSERT OR UPDATE OR DELETE ON puzzle_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_puzzle_gender_counts();

COMMENT ON FUNCTION sync_puzzle_gender_counts() IS
  'puzzle_members INSERT/DELETE 시 puzzles.current_male/female 자동 갱신. gender 스냅샷도 자동 채움.';

-- 5. 인덱스 (필터링용, 선택적)
CREATE INDEX IF NOT EXISTS idx_puzzle_members_gender ON puzzle_members(gender) WHERE gender IS NOT NULL;
