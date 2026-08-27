-- ============================================================================
-- Migration 576: 라인업 제보 — 누구나 포스터/타임테이블 이미지를 올린다
--
-- 배경:
--   인스타 자동 수집이 닿지 않는 클럽이 실측으로 확인됐다(2026-08-27).
--     - Restricted profile 4곳: groovenspot, outputbusan, veil_social_club, belpos_official
--       → 인스타가 로그인 없는 접근을 막아 데이터가 아예 안 온다. 코드로 못 고친다.
--     - not_found 4곳: 핸들 오타/폐업
--   이 구멍은 사람이 이미지를 올려주는 것 말고 메울 방법이 없다.
--
-- 설계 결정 (사용자 결정, 2026-08-27):
--   1. 이미지만 받는다. 클럽·날짜를 유저에게 묻지 않는다 — 이미지 안에 다 있다.
--   2. 업로드 시 자동 파싱하지 않는다. Vision 1건 35원(실측: 입력 7,074 +
--      출력 254 토큰, Sonnet 4.5)이라 제보가 늘면 그대로 비용이 된다.
--      관리자가 필요하다고 판단할 때만 파싱 버튼을 누른다. 단순한 포스터는
--      직접 입력이 더 빠르고 0원이다.
--   3. 검토 화면을 새로 만들지 않는다. /admin/lineups 가 이미 pending 초안을
--      검토·게시하는 화면이므로 거기 같이 뜬다.
--
-- 왜 lineup_drafts 에 얹지 않고 별도 테이블인가:
--   lineup_drafts.origin 은 'ig' | 'manual' 이고 ig_permalink 로 중복을 막는
--   구조라 "사람이 올린 이미지 여러 장"과 맞지 않는다. 제보는 접수→검토→게시
--   라는 자체 수명이 있고 제보자에게 결과를 알려야 하므로(반려 사유, 등록 알림)
--   상태를 따로 갖는 게 맞다. 게시 시점에 club_lineups 로 넘어간다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lineup_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 이미지 공개 URL 배열. 최대 3장은 트리거로 강제한다.
  image_urls TEXT[] NOT NULL,
  memo TEXT,

  -- 유저는 클럽/날짜를 안 낸다. 관리자가 확인하며 채우는 칸이다.
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  event_date DATE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),

  -- 파싱은 선택이다. 안 눌렀으면 NULL 로 남는다(= 비용 0).
  parsed JSONB,
  parsed_at TIMESTAMPTZ,
  parsed_by UUID REFERENCES users(id),

  reject_reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  -- 게시되면 어느 라인업이 됐는지 (제보자에게 "등록됐어요" 링크를 주기 위해)
  published_lineup_id UUID REFERENCES club_lineups(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lineup_reports_pending
  ON lineup_reports(created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lineup_reports_reporter
  ON lineup_reports(reporter_id, created_at DESC);

-- ── 이미지 장수 + 도배 방지 ────────────────────────────────────────────────
-- 상한을 두는 이유: 이미지는 스토리지 비용이고, 관리자가 파싱을 누르면 건당
-- 35원이 나간다. 악의 없는 연속 제출만으로도 검토 큐가 막힌다.
CREATE OR REPLACE FUNCTION check_lineup_report_limits()
RETURNS TRIGGER AS $$
DECLARE
  v_today_count INTEGER;
BEGIN
  IF array_length(NEW.image_urls, 1) IS NULL OR array_length(NEW.image_urls, 1) = 0 THEN
    RAISE EXCEPTION '이미지를 최소 1장 올려주세요';
  END IF;
  IF array_length(NEW.image_urls, 1) > 3 THEN
    RAISE EXCEPTION '이미지는 최대 3장까지 올릴 수 있어요';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM lineup_reports
  WHERE reporter_id = NEW.reporter_id
    AND created_at > now() - interval '24 hours';
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION '하루에 최대 10건까지 제보할 수 있어요';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lineup_report_limits ON lineup_reports;
CREATE TRIGGER trg_lineup_report_limits
  BEFORE INSERT ON lineup_reports
  FOR EACH ROW EXECUTE FUNCTION check_lineup_report_limits();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE lineup_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lineup_reports_insert ON lineup_reports;
CREATE POLICY lineup_reports_insert ON lineup_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

-- 본인 제보 + 관리자 전체. 남의 제보는 안 보인다.
DROP POLICY IF EXISTS lineup_reports_select ON lineup_reports;
CREATE POLICY lineup_reports_select ON lineup_reports
  FOR SELECT USING (reporter_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS lineup_reports_update ON lineup_reports;
CREATE POLICY lineup_reports_update ON lineup_reports
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- ── 관리자 푸시 알림 ───────────────────────────────────────────────────────
-- 제보는 사람이 봐야만 처리되므로, 쌓여 있는 걸 모르면 기능 자체가 죽는다.
-- notify_user_push 6-arg 는 카테고리/방해금지 체크를 타므로, 운영 알림은
-- 다른 admin 알림들과 같이 5-arg(강제 발송)를 쓴다(Migration 340 과 동일).
CREATE OR REPLACE FUNCTION notify_admins_lineup_report()
RETURNS TRIGGER AS $$
DECLARE
  v_admin UUID;
  v_name  TEXT;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(display_name, name, '익명') INTO v_name
  FROM users WHERE id = NEW.reporter_id;

  SELECT count(*) INTO v_count FROM lineup_reports WHERE status = 'pending';

  FOR v_admin IN
    SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    BEGIN
      PERFORM notify_user_push(
        v_admin,
        '라인업 제보 도착',
        v_name || ' · 이미지 ' || array_length(NEW.image_urls, 1) || '장'
          || CASE WHEN v_count > 1 THEN ' (대기 ' || v_count || '건)' ELSE '' END,
        jsonb_build_object('type', 'lineup_report', 'report_id', NEW.id::text),
        '/admin/lineups?tab=reports'
      );
    EXCEPTION WHEN OTHERS THEN
      -- 알림 실패가 제보 접수를 막으면 안 된다
      RAISE NOTICE 'notify_admins_lineup_report 실패: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_admins_lineup_report ON lineup_reports;
CREATE TRIGGER trg_notify_admins_lineup_report
  AFTER INSERT ON lineup_reports
  FOR EACH ROW EXECUTE FUNCTION notify_admins_lineup_report();

COMMENT ON TABLE lineup_reports IS
  '유저가 올린 라인업 포스터/타임테이블 제보. 자동 파싱 안 함(1건 35원) — 관리자가 필요할 때만 파싱.';
