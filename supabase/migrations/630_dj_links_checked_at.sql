-- ============================================================================
-- Migration 630: djs/artists.links_checked_at — 미리듣기 링크 조회 이력
-- 날짜: 2026-09-03
--
-- 배경:
--   DJ 의 사운드클라우드/유튜브는 인스타 프로필 바이오(또는 링크트리)에서
--   긁어온다(discover-dj-soundcloud*.mjs). 그런데 이 스크립트가 cron 에 없어
--   사람이 손으로 돌려야 했고, 마지막 실행이 8/30 이었다. 그 뒤 새로 들어온
--   DJ 279명은 인스타 핸들만 있고 미리듣기가 영영 비어 있다(실측).
--
--   자동화하려면 "이미 봤는데 없더라"를 기억해야 한다. 지금 대상 선정 조건은
--   soundcloud_url IS NULL 뿐이라, 바이오에 아무것도 없는 DJ 도 매번 다시
--   조회한다. 그대로 매일 돌리면 278명 × $0.0023 × 30일 = 월 $19 다.
--   조회 시각을 남기면 새로 생긴 DJ 만 보게 되어 월 $1 미만으로 떨어진다.
--
--   찾았든 못 찾았든 "본 시각"을 남긴다 — 못 찾은 경우를 기록하는 게 이 컬럼의
--   존재 이유다(찾은 경우는 soundcloud_url 자체가 이미 증거다).
-- ============================================================================

ALTER TABLE djs     ADD COLUMN IF NOT EXISTS links_checked_at TIMESTAMPTZ;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS links_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN djs.links_checked_at IS
  '미리듣기 링크(사클/유튜브)를 찾으려고 인스타 프로필을 마지막으로 조회한 시각. '
  '못 찾아도 기록한다 — 재조회를 막는 것이 목적. NULL = 한 번도 안 봄. '
  'discover-dj-links Edge Function / discover-dj-soundcloud*.mjs 가 갱신.';

COMMENT ON COLUMN artists.links_checked_at IS
  'djs.links_checked_at 과 동일 규약.';

-- 대상 선정 쿼리(링크 없음 + 오래전에 봤거나 안 봄)가 쓰는 인덱스.
-- 부분 인덱스 — 이미 링크가 있는 행은 애초에 대상이 아니다.
CREATE INDEX IF NOT EXISTS idx_djs_links_pending
  ON djs (links_checked_at NULLS FIRST)
  WHERE soundcloud_url IS NULL AND youtube_url IS NULL AND deleted_at IS NULL;

-- 이미 8/30 에 조회된 DJ 를 다시 보지 않도록 과거분을 채워 둔다.
--
-- 근거: 사클을 가진 148명 전원의 updated_at 이 2026-08-30 이다(실측) — 그날
-- 발굴 스크립트가 라인업 보유 DJ 전체를 훑었다는 뜻이다. 그때 대상이었던
-- 조건(라인업 있음 + 인스타 있음)을 그대로 재현해 그 시각을 박아 둔다.
-- 이걸 안 하면 자동화 첫 실행이 8/30 에 이미 "없음"을 확인한 DJ 를 전부 다시
-- 조회한다($0.64 낭비 + 아무 성과 없음).
UPDATE djs SET links_checked_at = TIMESTAMPTZ '2026-08-30 12:00:00+09'
WHERE links_checked_at IS NULL
  AND instagram IS NOT NULL
  AND created_at < TIMESTAMPTZ '2026-08-31 00:00:00+09'
  AND EXISTS (SELECT 1 FROM lineup_sets s WHERE s.dj_id = djs.id);
