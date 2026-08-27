-- ============================================================================
-- Migration 561: lineup_drafts — 수동/자동 파이프라인이 수렴하는 중간 테이블
-- 날짜: 2026-08-26
-- 선행: 557~560
--
-- 이 설계의 핵심 구조:
--   [자동] IG business_discovery 폴링 ─┐
--                                     ├─→ lineup_drafts (파싱 결과 + 신뢰도)
--   [수동] Admin 포스터 업로드 ────────┘        │
--                                             ├─ score≥85 & 미매칭DJ0 → 자동 게시
--                                             └─ 미달 → 검토 큐 → 운영자 확정
--                                                       ↓
--                                            upsert_club_lineup() RPC (Migration 559)
--
-- App Review 통과 전에는 위쪽(자동) 화살표만 비어 있다. 파싱·정규화·신뢰도·저장이
-- 한 벌의 코드이므로 전환 시 코드가 바뀌지 않는다.
--
-- UNIQUE(ig_permalink) 가 중복 방지의 정본: media ID는 재조회가 불가능하므로
-- (business_discovery 조사 결과) permalink가 유일하게 안정적인 키다.
-- 수집기는 INSERT를 시도하고 충돌하면 스킵한다 — 재실행 안전성이 코드가 아니라
-- 제약조건에서 나온다.
--
-- status='not_timetable' 이 중요하다: 타임테이블이 아닌 홍보물도 행은 남긴다.
-- 안 그러면 다음 폴링에서 같은 게시물에 또 Vision 비용을 쓴다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lineup_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  source_id UUID REFERENCES ig_sources(id) ON DELETE SET NULL, -- 수동이면 NULL

  origin TEXT NOT NULL CHECK (origin IN ('ig', 'manual')),

  -- 자동 수집 전용 필드 (수동이면 전부 NULL)
  ig_permalink TEXT,
  ig_media_timestamp TIMESTAMPTZ,
  ig_caption TEXT,

  -- Storage 에 보관한 포스터. media_url 은 만료되는 CDN URL이라 Vision 호출
  -- 전에 반드시 이쪽으로 먼저 옮겨야 한다.
  poster_url TEXT,

  -- 모델 원본 출력 (감사용, 절대 지우지 않는다)
  parsed JSONB,
  -- 서버 정규화 결과: { event_date, door_open_min, sets: [{raw_name, start_min, end_min, dj_id}] }
  normalized JSONB,

  confidence SMALLINT CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  -- 감점 항목별 breakdown. 임계값 튜닝의 근거 데이터.
  confidence_detail JSONB,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_published', 'published', 'rejected', 'not_timetable', 'parse_failed')),
  reject_reason TEXT,

  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- 게시 완료 시 club_lineups 역참조
  lineup_id UUID REFERENCES club_lineups(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- permalink 중복 방지 (수동 건은 permalink 가 NULL 이라 유니크 제약에서 제외)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lineup_drafts_permalink
  ON lineup_drafts(ig_permalink) WHERE ig_permalink IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lineup_drafts_queue ON lineup_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lineup_drafts_club ON lineup_drafts(club_id, created_at DESC);

DROP TRIGGER IF EXISTS lineup_drafts_updated_at ON lineup_drafts;
CREATE TRIGGER lineup_drafts_updated_at
  BEFORE UPDATE ON lineup_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- club_lineups.draft_id 가 이 테이블을 참조하도록 FK 를 이제 추가한다
-- (561이 없던 558 시점엔 참조 대상이 없어 컬럼만 두고 FK 는 여기서 건다)
ALTER TABLE club_lineups
  DROP CONSTRAINT IF EXISTS club_lineups_draft_id_fkey;
ALTER TABLE club_lineups
  ADD CONSTRAINT club_lineups_draft_id_fkey
  FOREIGN KEY (draft_id) REFERENCES lineup_drafts(id) ON DELETE SET NULL;

-- RLS: 전부 admin only. 검토 전 초안은 공개하지 않는다. Edge Function 은 service_role 로 접근.
ALTER TABLE lineup_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lineup_drafts_admin_all ON lineup_drafts;
CREATE POLICY lineup_drafts_admin_all ON lineup_drafts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

COMMENT ON TABLE lineup_drafts IS '수동/자동 파싱 결과가 수렴하는 중간 테이블. 신뢰도 점수로 자동 게시 여부를 가른다.';
COMMENT ON COLUMN lineup_drafts.ig_permalink IS 'UNIQUE(부분 인덱스). 중복 수집 방지의 유일한 방어선 — media ID는 재조회 불가.';
COMMENT ON COLUMN lineup_drafts.status IS 'not_timetable 도 행을 남긴다 — 같은 게시물 재파싱으로 Vision 비용 낭비하지 않기 위함.';
COMMENT ON COLUMN lineup_drafts.parsed IS '모델 원본 출력. 감사용, 정규화 로직 버그 발견 시 재처리 근거.';
