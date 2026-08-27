-- ============================================================================
-- Migration 570: DJ 찜 (user_favorite_djs)
-- 날짜: 2026-08-26
-- 선행: 557 (djs)
--
-- 전국 DJ 라인업 화면(/lineups)에서 유저가 DJ에 하트를 누르면, 그 DJ가
-- 날짜 그룹 안에서 위로 정렬된다. "하트한 것만 보기"(필터)가 아니라 정렬이므로
-- 나머지 DJ도 계속 보인다.
--
-- 구조는 070(클럽 찜)·083(MD 찜)과 동일한 3번째 인스턴스다. 같은 패턴을 이미
-- 두 번 복제한 선례가 있어 훅·Context·버튼 레이어까지 1:1로 대응된다.
--
-- 배열 컬럼(users.favorite_dj_ids) 대신 조인 테이블을 쓰는 이유:
--   - 개수 무제한
--   - 역방향 조회("이 DJ를 찜한 유저 전원")가 나중 알림 팬아웃에 필수인데,
--     배열이면 WHERE dj_id = ANY(...) GIN 스캔이 되어 비효율적이다.
--     (504의 puzzles.preferred_club_ids는 "한 레코드에 종속된 최대 3개"라 배열이 맞는 경우)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_favorite_djs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dj_id      UUID NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 훅이 23505(중복 키)를 잡아 "이미 찜함"으로 흡수하는 근거
  UNIQUE(user_id, dj_id)
);

-- 양방향 조회. dj_id 인덱스는 나중에 "이 DJ를 찜한 유저 전원" 알림 팬아웃에 쓰인다.
CREATE INDEX IF NOT EXISTS idx_favorite_djs_user ON user_favorite_djs(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_djs_dj   ON user_favorite_djs(dj_id);

ALTER TABLE user_favorite_djs ENABLE ROW LEVEL SECURITY;

-- 070/083과 동일: 본인 찜만 관리 가능.
-- 찜 카운트를 화면에 노출할 때가 오면 243처럼 FOR SELECT USING (TRUE) 공개 정책을
-- 별도 마이그레이션으로 추가한다(이번 범위에선 카운트를 안 보여주므로 불필요).
DROP POLICY IF EXISTS "Users can manage own DJ favorites" ON user_favorite_djs;
CREATE POLICY "Users can manage own DJ favorites" ON user_favorite_djs
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE user_favorite_djs IS
  '유저가 찜한 DJ. /lineups 화면에서 날짜 그룹 내 정렬 우선순위로 쓴다(필터 아님).';
