-- ============================================================================
-- Migration 605: venues — 공연장을 클럽과 분리해서 담는다
-- 날짜: 2026-08-29
-- 선행: 558(club_events), 561(lineup_drafts), 566(venue_type), 567/569(쓰기 게이트)
--
-- 왜 clubs 에 안 넣는가:
--   clubs 는 "테이블 예약이 가능한 업장"이라는 전제로 83개 파일이 짜여 있다
--   (클럽지도·게스트 간판·깃발 생성·MD 대시보드·쿠폰·조각…). 롤링홀·무신사개러지
--   같은 라이브 공연장은 그 전제를 하나도 만족하지 않는다(주대·MD·예약 개념 없음).
--   여기에 억지로 넣으면 전제가 깨진 행이 83곳을 돌아다니고, 목록 쿼리마다
--   필터를 걸어야 하는데 하나만 빠뜨려도 공연장이 클럽인 척 노출된다.
--   566 주석이 이미 같은 문제를 지적해뒀다 — "클럽이 아닌데 클럽 등록 후보처럼
--   보임". 그 라벨을 registry 밖으로 꺼내 별도 엔티티로 세운다.
--
-- 왜 지금 필요한가 (실측 2026-08-29):
--   club_events approved 502건 중 앞으로 열릴 공연이 21건뿐이고, 그 출처의 97%가
--   hiphopplayacalendar 한 곳이다. 즉 힙합플레이야가 아는 것 이상을 알 수 없다.
--   반면 club_name_registry 에는 인스타 핸들까지 확보된 공연장 15곳이 놀고 있고,
--   그곳들에서 이미 공연 33건이 목격됐다(무신사개러지 8, 롤링홀 7…).
--   수집 대상에 넣지 못한 이유가 순전히 "clubs 에 못 넣어서" 였다.
--
-- ⚠️ lineup_drafts.club_id NOT NULL 해제가 이 마이그레이션의 핵심이다:
--    수집기는 게시물을 처리하기 전에 draft 를 INSERT 해 ig_permalink 를 선점한다.
--    공연장 소스는 club_id 가 없어서 이 INSERT 가 NOT NULL 위반으로 실패하고,
--    실패하면 `if (draftErr || !draft) return;` 로 게시물이 조용히 버려진다.
--    이걸 안 풀면 공연장 계정을 수집 목록에 넣어봐야 Apify 비용만 나가고
--    저장되는 건 0건이다.
-- ============================================================================

-- ============================================================================
-- 1) venues — 공연장 마스터
-- ============================================================================
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  -- URL 세그먼트 (/venues/{slug}). djs.slug 와 같은 규약(소문자 영숫자+하이픈).
  slug TEXT NOT NULL UNIQUE,

  -- 핸들만 저장 (@ 없이) — clubs.instagram / djs.instagram 과 동일 규약(203)
  instagram TEXT,

  area TEXT,
  address TEXT,
  latitude  DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  description TEXT,
  thumbnail_url TEXT,

  -- 566 과 같은 값 체계. 여기 들어오는 건 대부분 'venue' 지만, 라이브바처럼
  -- 경계가 모호한 곳을 'other' 로 두고 화면에서 문구만 달리할 수 있게 남긴다.
  venue_type TEXT NOT NULL DEFAULT 'venue'
    CHECK (venue_type IN ('venue', 'other')),

  is_test BOOLEAN NOT NULL DEFAULT false,
  -- 공연 이력이 남으므로 하드 삭제하지 않는다 (djs 와 같은 판단, 557)
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug) WHERE deleted_at IS NULL;
-- 수집기가 매 실행마다 핸들→장소 맵을 만든다. 대소문자 무시 조회.
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_instagram
  ON venues(lower(instagram)) WHERE instagram IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS venues_updated_at ON venues;
CREATE TRIGGER venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE venues IS
  '라이브 공연장/콘서트홀. clubs(테이블 예약 업장)와 의도적으로 분리 — 클럽 목록·지도·게스트·깃발 어디에도 섞이지 않는다.';

-- ============================================================================
-- 2) club_events → venues 연결
--    club_id 와 배타적으로 쓴다: 클럽에서 열린 공연은 club_id, 공연장에서 열린
--    공연은 venue_id. 둘 다 NULL 인 행(장소 미등록)은 지금도 293건 정상 동작 중이라
--    그대로 허용한다 — club_name_raw 로 화면에 뜬다.
-- ============================================================================
ALTER TABLE club_events ADD COLUMN IF NOT EXISTS venue_id UUID
  REFERENCES venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_events_venue
  ON club_events(venue_id, event_date DESC) WHERE venue_id IS NOT NULL;

COMMENT ON COLUMN club_events.venue_id IS
  '공연장에서 열린 공연. club_id 와 배타적. 둘 다 NULL 이면 미등록 장소(club_name_raw 로만 표시).';

-- ============================================================================
-- 3) lineup_drafts — 공연장 게시물도 선점할 수 있게
--
-- club_id NOT NULL 을 풀고 venue_id 를 추가한다. 둘 다 NULL 인 draft 는 만들지
-- 않는다는 규칙을 CHECK 로 박아, 어느 소스에서 온 게시물인지 항상 남게 한다.
-- ============================================================================
ALTER TABLE lineup_drafts ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE lineup_drafts ADD COLUMN IF NOT EXISTS venue_id UUID
  REFERENCES venues(id) ON DELETE CASCADE;

ALTER TABLE lineup_drafts DROP CONSTRAINT IF EXISTS lineup_drafts_source_chk;
ALTER TABLE lineup_drafts ADD CONSTRAINT lineup_drafts_source_chk
  CHECK (club_id IS NOT NULL OR venue_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_lineup_drafts_venue
  ON lineup_drafts(venue_id, created_at DESC) WHERE venue_id IS NOT NULL;

-- ============================================================================
-- 4) RLS — djs/club_lineups 와 동일 정책 (읽기 공개, 쓰기는 admin+service_role)
--
-- 읽기를 공개하는 이유: /venues/{slug} 가 SSR 로 렌더돼 크롤러가 봐야 한다.
-- 이게 빠지면 공연장 페이지가 빈 페이지로 색인된다(559 와 같은 근거).
-- ============================================================================
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venues_select_public ON venues;
CREATE POLICY venues_select_public ON venues
  FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS venues_write ON venues;
CREATE POLICY venues_write ON venues
  FOR ALL USING (can_write_lineups()) WITH CHECK (can_write_lineups());

-- ============================================================================
-- 5) 시드 — club_name_registry 에서 공연 1건 이상인 공연장만
--
-- 0건 3곳(Lowkey / Space Brick 중복행 / 101 breaktime)은 제외한다: 실제로
-- 공연장인지 확인된 바가 없고, 넣어봐야 빈 페이지가 된다(thin content).
--
-- 중복 처리:
--   - '신도시'와 '신도시 별관'이 같은 핸들(@seendosi) → 핸들 UNIQUE 가 막는다.
--     event_count 가 큰 쪽(신도시)이 남는다.
--   - 'SPACE BRICK'과 'Space Brick' 대소문자 차이 → 같은 핸들이라 역시 하나만.
--   DISTINCT ON 으로 핸들당 1행만 고르고, 공연 수가 많은 쪽을 정본으로 삼는다.
--
-- slug: 이름이 한글이면 핸들에서 만든다(한글 slug 는 URL 인코딩돼 지저분해진다).
-- ============================================================================
INSERT INTO venues (name, slug, instagram, area, venue_type)
SELECT
  r.name_raw,
  -- 영문 이름이면 이름 기반, 아니면 핸들 기반 slug
  CASE
    WHEN r.name_raw ~ '^[A-Za-z0-9 ''&.\-]+$'
      THEN regexp_replace(regexp_replace(lower(trim(r.name_raw)), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')
    ELSE regexp_replace(regexp_replace(lower(r.instagram_handle), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')
  END AS slug,
  lower(r.instagram_handle),
  r.area_guess,
  -- registry 가 'club' 이라고 본 곳도 여기 오는 건 clubs 에 등록 안 된 라이브바다.
  -- venues.venue_type 은 'venue'|'other' 만 허용하므로 club → other 로 접는다.
  CASE WHEN r.venue_type = 'venue' THEN 'venue' ELSE 'other' END
FROM (
  SELECT DISTINCT ON (lower(instagram_handle)) *
  FROM club_name_registry
  WHERE instagram_handle IS NOT NULL
    AND instagram_handle <> ''
    AND COALESCE(event_count, 0) >= 1
    -- 이미 clubs 로 등록된 곳은 제외 (클럽은 클럽 트랙에 그대로 둔다)
    AND lower(instagram_handle) NOT IN (
      SELECT lower(instagram) FROM clubs
      WHERE instagram IS NOT NULL AND instagram <> '' AND deleted_at IS NULL
    )
  ORDER BY lower(instagram_handle), COALESCE(event_count, 0) DESC
) r
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6) 기존 공연 → venues 역연결
--    club_name_registry.normalized_name 을 거쳐 club_events.club_name_raw 와 맞춘다.
--    이미 club_id 가 붙은 공연은 건드리지 않는다(클럽에서 열린 공연이므로).
-- ============================================================================
UPDATE club_events e
SET venue_id = v.id
FROM club_name_registry r
JOIN venues v ON lower(v.instagram) = lower(r.instagram_handle)
WHERE e.club_id IS NULL
  AND e.venue_id IS NULL
  AND r.name_raw = e.club_name_raw;

-- ============================================================================
-- 적용 후 확인:
--   SELECT name, slug, instagram, area, venue_type FROM venues ORDER BY name;
--     → 15곳 (0건 3곳 제외, 핸들 중복 합쳐짐)
--   SELECT count(*) FROM club_events WHERE venue_id IS NOT NULL;
--     → 30건 안팎이 역연결돼야 정상
--   SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name='lineup_drafts' AND column_name='club_id';
--     → is_nullable = YES
-- ============================================================================
