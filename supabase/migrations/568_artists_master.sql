-- ============================================================================
-- Migration 568: artists 마스터 — 언더그라운드 공연 아티스트 엔티티
-- 날짜: 2026-08-26
-- 선행: 563(club_events), 567(ensure_dj 규약)
--
-- 배경:
--   club_events.lineup 이 TEXT[] 문자열 배열이라 "가수 이름 클릭 → 그 사람
--   인스타/정보"로 이어질 수가 없다. 최종 목표(공연 → 아티스트 → 클럽 →
--   쿠폰/조각/게스트 연결)를 만족하려면 사람이 독립 엔티티여야 한다.
--
--   djs(557)와 같은 구조를 쓰되 테이블은 분리한다 — DJ와 가수는 화면·속성이
--   다르고(레지던트 클럽 vs 소속사), 탭도 <DJ 타임테이블> / <언더그라운드 공연>
--   으로 갈린다.
--
--   artist_aliases.normalized UNIQUE 가 동일인 분열을 막는 정본이다.
--   (djs/dj_aliases 와 완전히 동일한 규약 — normalizeDjName 로직 공유)
-- ============================================================================

-- ============================================================================
-- 1) artists — 래퍼/가수 마스터
-- ============================================================================
CREATE TABLE IF NOT EXISTS artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 정본 표시명 (예: "팔로알토"). 캡션 표기가 아니라 대표 이름 1개
  display_name TEXT NOT NULL,

  -- URL 세그먼트 (/artists/{slug})
  slug TEXT NOT NULL UNIQUE,

  -- 핸들만 저장 (clubs.instagram / djs.instagram 과 동일 규약, Migration 203)
  instagram TEXT,
  soundcloud_url TEXT,
  youtube_url TEXT,

  bio TEXT,
  photo_url TEXT,

  -- 소속 레이블/크루 (자유 텍스트 — 정규화할 만큼 데이터가 쌓이면 별도 테이블로)
  label TEXT,

  is_test BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);

-- ============================================================================
-- 2) artist_aliases — 표기 변형 → 동일인 통합
--    "팔로알토" / "Paloalto" / "PALOALTO" 가 한 artist_id 로 모인다.
--    한글↔영문은 자동 매칭되지 않는다(djName.ts 규약과 동일) — 수동 연결 필요.
-- ============================================================================
CREATE TABLE IF NOT EXISTS artist_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(normalized)
);

CREATE INDEX IF NOT EXISTS idx_artist_aliases_artist ON artist_aliases(artist_id);

-- ============================================================================
-- 3) club_event_performers — 공연 ↔ 아티스트 조인
--    club_events.lineup(TEXT[])은 원문 보존용으로 남기고, 실제 링크는 여기로.
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_event_performers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  raw_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_cep_event ON club_event_performers(event_id);
CREATE INDEX IF NOT EXISTS idx_cep_artist ON club_event_performers(artist_id);

-- ============================================================================
-- 4) ensure_artist() — 표기로 artists 행을 찾거나 만들고 id 반환
--    ensure_dj(567)와 동일한 구조.
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_artist(p_raw_name TEXT, p_normalized TEXT)
RETURNS UUID AS $$
DECLARE
  v_artist_id UUID;
  v_slug      TEXT;
BEGIN
  IF p_normalized IS NULL OR p_normalized = '' THEN
    RETURN NULL;
  END IF;

  SELECT artist_id INTO v_artist_id FROM artist_aliases WHERE normalized = p_normalized LIMIT 1;
  IF v_artist_id IS NOT NULL THEN
    RETURN v_artist_id;
  END IF;

  -- slug: URL 세그먼트라 영숫자+하이픈만. 한글 표기는 해시 기반 대체 slug.
  v_slug := regexp_replace(lower(p_normalized), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN
    v_slug := 'artist-' || substr(md5(p_normalized), 1, 8);
  END IF;
  IF EXISTS (SELECT 1 FROM artists WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO artists (display_name, slug)
  VALUES (p_raw_name, v_slug)
  RETURNING id INTO v_artist_id;

  INSERT INTO artist_aliases (artist_id, alias, normalized)
  VALUES (v_artist_id, p_raw_name, p_normalized)
  ON CONFLICT (normalized) DO NOTHING;

  RETURN v_artist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5) RLS — 읽기는 공개(SEO/유저 화면), 쓰기는 can_write_lineups()
--    = service_role(Edge Function 자동 수집) 또는 admin. 567에서 정의된
--    라인업 계열 전용 게이트를 공유한다. is_admin()은 28개 마이그레이션이
--    쓰는 전역 헬퍼라 건드리지 않는다.
-- ============================================================================
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_event_performers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can read artists" ON artists;
CREATE POLICY "anyone can read artists" ON artists
  FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "admin can write artists" ON artists;
CREATE POLICY "admin can write artists" ON artists
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS "anyone can read artist_aliases" ON artist_aliases;
CREATE POLICY "anyone can read artist_aliases" ON artist_aliases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin can write artist_aliases" ON artist_aliases;
CREATE POLICY "admin can write artist_aliases" ON artist_aliases
  FOR ALL USING (can_write_lineups());

DROP POLICY IF EXISTS "anyone can read performers" ON club_event_performers;
CREATE POLICY "anyone can read performers" ON club_event_performers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin can write performers" ON club_event_performers;
CREATE POLICY "admin can write performers" ON club_event_performers
  FOR ALL USING (can_write_lineups());

COMMENT ON TABLE artists IS
  '언더그라운드 공연 아티스트(래퍼/가수) 마스터. DJ는 djs(557) 별도. artist_aliases.normalized UNIQUE 로 동일인 분열 방지.';

-- ============================================================================
-- 6) club_lineups.confidence — 자동 게시 정확도 사후 감사용
--    검토 큐(사람 승인)는 무인 자동 운영으로 폐기했지만, 신뢰도 점수 계산 자체는
--    남긴다. 무인일수록 "Vision이 잘못 읽은 라인업이 그대로 공개"되는 위험이 커지고,
--    점수를 기록해두면 나중에 임계값을 정하거나 오파싱을 역추적할 근거가 된다.
--    scoreLineup()은 순수 함수라 계산 비용은 사실상 0.
-- ============================================================================
ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS confidence SMALLINT;
ALTER TABLE club_lineups ADD COLUMN IF NOT EXISTS confidence_detail JSONB;

COMMENT ON COLUMN club_lineups.confidence IS
  'Vision 파싱 신뢰도 0~100 (scoreLineup). 게시를 막지는 않고 사후 감사·임계값 튜닝 근거로만 쓴다.';
