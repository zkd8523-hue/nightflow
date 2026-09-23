-- ============================================================================
-- Migration 670: 지역별 추천 클럽 1곳 (외국인 목록 카드 강조)
--
-- 배경(2026-09-23): 오가닉 외국인 세션 271건 분석 — 클럽 목록·상세는 잘 읽지만
-- (이탈 3~5%) 예약 가능 22곳 중 어디를 고를지 못 정하고 나간다. 지역별로 "우리가
-- 고른 한 곳"을 카드에 표시해 선택을 줄인다. 사장님 지정(2026-09-23):
--   강남 Club Ace · 이태원 Day&night · 홍대 CLUB BERMUDA · 부산 Groove & Spot
--
-- featured_rank(Mig 485)와는 다른 축이다 — 그건 정렬 순서(높을수록 위)고 여러
-- 클럽에 겹쳐 쓴다. 이건 "지역당 정확히 하나"라는 편집 판단이라 boolean + 부분
-- 유니크 인덱스로 DB가 규칙을 강제한다. 어드민에서 실수로 두 개 켜면 INSERT/UPDATE가
-- 실패하지, 카드에 별이 두 개 뜨지 않는다.
--
-- 예약 불가 클럽에는 켜지 않는다 — 추천했는데 예약이 안 되면 신뢰가 깨진다.
-- 코드(isBookable) 쪽 규칙이라 DB 제약으로는 못 걸고, 아래 UPDATE가 4곳 모두
-- has_menu && (has_md || agreed)를 만족하는 걸 2026-09-23 실측으로 확인했다.
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS area_pick BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clubs.area_pick IS
  '외국인 목록 카드에 "Our pick" 강조를 붙이는 지역별 추천 클럽. 지역당 정확히 1곳(부분 유니크 인덱스로 강제). '
  'featured_rank(정렬)와 별개 축. 예약 가능(isBookable) 클럽에만 켤 것(Migration 670).';

-- 지역당 하나만. 삭제된 클럽은 제외해서, 클럽을 지우고 같은 지역에 새로 지정할 수 있게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS clubs_area_pick_one_per_area
  ON clubs (area)
  WHERE area_pick = TRUE AND deleted_at IS NULL;

-- 사장님 지정 4곳. name_en으로 잡되 지역까지 같이 걸어서 동명 클럽(예: 부산 지점)을 피한다.
UPDATE clubs SET area_pick = TRUE
WHERE deleted_at IS NULL AND (
     (name_en = 'Club Ace'      AND area = '강남')
  OR (name_en = 'Day&night'    AND area = '이태원')
  OR (name_en = 'CLUB BERMUDA' AND area = '홍대')
  OR (name_en = 'Groove & Spot' AND area = '부산')
);
