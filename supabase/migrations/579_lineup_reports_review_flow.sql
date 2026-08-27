-- ============================================================================
-- Migration 579: 제보 → 기존 검토 화면으로 흘려보내는 다리
--
-- 배경(2026-08-27 발견): lineup_reports(576)는 저장·admin 푸시까지는 되는데,
-- 그걸 검토할 화면이 없다. 코드베이스 전체에서 lineup_reports 를 참조하는 곳이
-- LineupReportSheet.tsx 의 INSERT 한 곳뿐이었다 — 유저에게는 "확인 후
-- 등록해드릴게요"라고 약속해놓고 지킬 방법이 없는 상태로 나가 있었다.
--
-- 새 검토 UI를 통째로 새로 만드는 대신, 이미 있는 /admin/lineups 검토 화면
-- (AdminLineupEditor, publish API)을 재사용한다. 그러려면 제보를 그 화면이
-- 아는 형태(lineup_drafts)로 넘겨야 한다 — origin 값만 하나 늘리면 된다.
-- publish API의 draftId는 이미 optional이라 추가 변경이 필요 없다.
--
-- 흐름: 유저 제보(lineup_reports, 이미지만) → 관리자가 /admin/lineups 에서
--   "파싱" 누름(선택, 35원) → lineup_drafts(origin='report') 행 생성,
--   parsed 채움 → 기존 편집 화면에서 검토·게시 → lineup_reports.status 갱신
--   (게시된 lineup_id 를 남겨 제보자에게 "등록됐어요"를 보여줄 수 있게)
-- ============================================================================

-- 제약 이름을 확신할 수 없어(Postgres 자동 명명 규칙 vs 명시적 이름) 동적으로
-- 찾아 지운다. origin 컬럼에 걸린 CHECK 제약이 여러 개일 리 없으므로 안전하다.
DO $$
DECLARE v_conname TEXT;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'lineup_drafts'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%origin%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE lineup_drafts DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE lineup_drafts ADD CONSTRAINT lineup_drafts_origin_check
  CHECK (origin IN ('ig', 'manual', 'report'));

-- 제보 원본과 그로부터 만들어진 검토용 draft를 연결 — 게시/반려 결과를
-- 제보 쪽에 되돌려 쓰기 위함(제보자 알림, "이미 처리한 제보" 중복 방지).
ALTER TABLE lineup_drafts ADD COLUMN IF NOT EXISTS source_report_id UUID
  REFERENCES lineup_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lineup_drafts_source_report ON lineup_drafts(source_report_id);

COMMENT ON COLUMN lineup_drafts.source_report_id IS
  '이 초안이 유저 제보(lineup_reports)에서 만들어졌으면 그 제보 id. 관리자가 직접 업로드했으면 NULL.';
