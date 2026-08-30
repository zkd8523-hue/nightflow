-- 616: DJ 장르 (DJ 이상형 월드컵 취향 분석용)
--
-- 출처는 사운드클라우드 프로필 페이지의 <meta itemprop="genre">다 — DJ 본인이
-- 자기 업로드 트랙에 단 태그이므로, 클럽 태그("어느 클럽에 불려가는가")보다
-- "무슨 음악을 하는가"에 훨씬 가깝다. API 키 없이 공개 HTML로 수집한다
-- (scripts/backfill-dj-genre.mjs).
--
-- ⚠️ 한계: 트는 음악이 아니라 '업로드한' 음악이다. 대체로 일치하지만
-- 항상은 아니다. 그래서 genre_source를 남겨 근거를 구분한다.
--
-- 실측(표본 20명): 원본 태그 80% → 정규화 후 75% 확보.
-- 실패의 대부분은 업로드 0곡(리포스트 전용 계정)이라 어떤 방법으로도 못 채운다.
-- 나머지는 클럽 장르 태그로 폴백한다(genre_source='club').

ALTER TABLE djs
  ADD COLUMN IF NOT EXISTS genre TEXT,
  -- 최빈 장르가 전체에서 차지하는 비율(0~100). 낮으면 취향이 넓다는 뜻이라
  -- 우승 화면에서 "확고함/잡식" 같은 표현의 근거로 쓸 수 있다.
  ADD COLUMN IF NOT EXISTS genre_confidence SMALLINT,
  -- 'soundcloud' = 본인 업로드 태그 / 'club' = 플레이한 클럽 태그 폴백
  ADD COLUMN IF NOT EXISTS genre_source TEXT,
  ADD COLUMN IF NOT EXISTS genre_updated_at TIMESTAMPTZ;

-- 정규화된 대분류만 허용한다. 원본 태그는 자유 입력이라 노이즈가 심하다
-- (실측: 'News & Politics', 'summer', 활동명, '케이팝,소년만화,K-pop,...').
-- 스크립트에서 매핑하고, DB는 마지막 방어선으로 값을 강제한다.
ALTER TABLE djs DROP CONSTRAINT IF EXISTS djs_genre_check;
ALTER TABLE djs ADD CONSTRAINT djs_genre_check
  CHECK (genre IS NULL OR genre IN ('House','Techno','EDM','HipHop','RnB','Global'));

ALTER TABLE djs DROP CONSTRAINT IF EXISTS djs_genre_source_check;
ALTER TABLE djs ADD CONSTRAINT djs_genre_source_check
  CHECK (genre_source IS NULL OR genre_source IN ('soundcloud','club'));

ALTER TABLE djs DROP CONSTRAINT IF EXISTS djs_genre_confidence_check;
ALTER TABLE djs ADD CONSTRAINT djs_genre_confidence_check
  CHECK (genre_confidence IS NULL OR (genre_confidence BETWEEN 0 AND 100));

-- 월드컵 후보 조회는 장르로 필터하지 않지만(재생 가능 여부로만 뽑는다),
-- 장르별 집계·미수집 DJ 조회에 쓴다.
CREATE INDEX IF NOT EXISTS idx_djs_genre ON djs(genre) WHERE genre IS NOT NULL;

COMMENT ON COLUMN djs.genre IS '정규화된 대분류 장르. 출처는 genre_source 참조 (Migration 616)';
COMMENT ON COLUMN djs.genre_confidence IS '최빈 장르 비율 0~100. 낮을수록 잡식 (Migration 616)';
COMMENT ON COLUMN djs.genre_source IS 'soundcloud=본인 업로드 태그, club=클럽 태그 폴백 (Migration 616)';
