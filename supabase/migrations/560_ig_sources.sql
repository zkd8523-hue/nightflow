-- ============================================================================
-- Migration 560: 인스타그램 수집 소스 등록
-- 날짜: 2026-08-26
-- 선행: 557~559
--
-- clubs.instagram 만으로는 부족한 이유:
--   - 클럽 공식 계정과 "타임테이블을 실제로 올리는 계정"이 다를 수 있음
--   - 폴링 커서(last_polled_at)·실패 카운트를 clubs 테이블에 붙이면 오염
--   - 한 클럽이 계정을 2개 쓸 수 있음(본계정 + 이벤트 계정)
--
-- priority 컬럼은 두지 않는다: business_discovery rate limit(200×DAU/시간)을
-- 실측한 결과 활성 소스 ~94곳을 매일 2회(15시/21시) 전부 동일하게 돌려도
-- 여유가 20배 이상이다. 등급을 나누면 운영자 관리 부담만 늘고 얻는 게 없다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ig_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

  -- 핸들만 (@ 없이)
  ig_username TEXT NOT NULL CHECK (ig_username ~ '^[a-zA-Z0-9._]{1,30}$'),

  is_active BOOLEAN NOT NULL DEFAULT true,

  -- 폴링 커서 (이 소스를 마지막으로 실제 조회한 시각)
  last_polled_at TIMESTAMPTZ,
  -- 콘텐츠 커서 (이보다 오래된 media 는 재파싱하지 않음)
  last_media_timestamp TIMESTAMPTZ,
  -- 마지막으로 "게시물을 실제로 본" 시각 (media_seen > 0 이었던 마지막 실행)
  last_success_at TIMESTAMPTZ,

  consecutive_failures SMALLINT NOT NULL DEFAULT 0,
  last_error TEXT,

  -- 운영 메모. 'duplicate_handle', 'story_only' 등 자동/수동 태깅에 사용
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(club_id, ig_username)
);

CREATE INDEX IF NOT EXISTS idx_ig_sources_polling ON ig_sources(is_active, last_polled_at);

DROP TRIGGER IF EXISTS ig_sources_updated_at ON ig_sources;
CREATE TRIGGER ig_sources_updated_at
  BEFORE UPDATE ON ig_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin only (전부 비공개 — 수집 인프라 정보는 공개할 이유가 없다)
ALTER TABLE ig_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ig_sources_admin_all ON ig_sources;
CREATE POLICY ig_sources_admin_all ON ig_sources
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- 시드: clubs.instagram 을 그대로 가져온다.
-- 실측(2026-08-26 프로덕션 조회): 승인 클럽 99곳 중 95곳이 이미 instagram 핸들 보유.
-- ============================================================================
INSERT INTO ig_sources (club_id, ig_username)
SELECT id, trim(instagram)
FROM clubs
WHERE instagram IS NOT NULL
  AND trim(instagram) <> ''
  AND status = 'approved'
  AND deleted_at IS NULL
  AND is_test = false
ON CONFLICT (club_id, ig_username) DO NOTHING;

-- ============================================================================
-- 중복 핸들 처리 (필수):
--   실측 확인된 사례 — 홍대 "XX"와 "XX2"가 둘 다 @hongdae_xx 를 쓴다.
--   UNIQUE(club_id, ig_username) 은 club_id 가 다르므로 통과하지만,
--   같은 게시물을 두 클럽에 저장하려다 lineup_drafts.ig_permalink UNIQUE(Migration 561)
--   에 걸려 "어느 클럽에 붙을지가 실행 순서에 좌우"되는 문제가 생긴다.
--   같은 핸들을 쓰는 클럽이 여럿이면 먼저 생성된 클럽(=먼저 등록된 클럽) 1곳만 남기고
--   나머지는 비활성화 + notes 로 표시한다. 운영자가 Admin 소스 관리에서
--   실제로 맞는 쪽을 판단해 activate/deactivate 한다.
-- ============================================================================
UPDATE ig_sources s
SET is_active = false, notes = 'duplicate_handle'
WHERE EXISTS (
  SELECT 1 FROM ig_sources o
  JOIN clubs c_s ON c_s.id = s.club_id
  JOIN clubs c_o ON c_o.id = o.club_id
  WHERE o.ig_username = s.ig_username
    AND o.id <> s.id
    AND c_o.created_at < c_s.created_at
);

COMMENT ON TABLE ig_sources IS '자동 수집 대상 인스타 계정. clubs.instagram 에서 시드, 이후 이 테이블이 SSOT.';
COMMENT ON COLUMN ig_sources.notes IS 'duplicate_handle=같은 핸들 중복 등록, story_only=피드에 안 올려 자동 수집 불가로 판별됨.';
