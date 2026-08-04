-- ============================================================================
-- Migration 504: 깃발에 "가고싶은 클럽" 지정 → 매칭 푸시 + 영업 수요 집계
-- 날짜: 2026-08-04
-- 설명:
--   한국 깃발 매칭률이 낮은 원인 중 하나 = 유저가 어떤 클럽을 원하는지 시스템이 모름
--   (기존엔 지역 기반 브로드캐스트뿐). 외국인 플로우(foreign_requests.club_ids)처럼
--   깃발에도 지정 클럽(최대 3, 선택)을 붙여 ①매칭 강화(지정 클럽 파트너 MD 직접 푸시)
--   ②영업 리드(등록 클럽 pin 집계 → 파트너 없는 인기 클럽 = 영업 타겟) 두 마리 토끼.
--
--   기존 인프라 재사용:
--     - user_pinned_clubs (Migration 280): 프로필 pin, 이미 최대 3개 제한 트리거 有
--     - club_requests (Migration 212): 미등록 클럽 위시 → 영업 리드, admin-only SELECT
--     - md_puzzle_area_subs + trg_puzzle_push_md_area_match (Migration 228): 지역 푸시
--     - club_review_summary (Migration 217): 집계 뷰 패턴 참고
-- ============================================================================

-- ============================================================================
-- 1) puzzles.preferred_club_ids — 깃발이 지정한 클럽(우선순위 순서, 최대 3은 앱에서 검증)
-- ============================================================================
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS preferred_club_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_puzzles_preferred_clubs ON puzzles USING GIN (preferred_club_ids);

COMMENT ON COLUMN puzzles.preferred_club_ids IS
  '깃발이 지정한 가고싶은 클럽(최대 3, 우선순위 순). foreign_requests.club_ids와 동일 패턴. 비어있으면 특정 클럽 없음(지역 매칭만).';

-- ============================================================================
-- 2) 매칭 푸시 확장 — 지정 클럽의 파트너 MD에게 직접 발송 (지역 구독 푸시와 별개, 중복 제거)
--    기존 함수(Migration 228)를 CREATE OR REPLACE로 확장. 지역 로직은 그대로 두고
--    클럽 직접매칭 브랜치를 추가 + 두 브랜치 간 수신자 중복(한 MD가 두 번 안 받게) 제거.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_puzzle_push_md_area_match()
RETURNS TRIGGER AS $$
DECLARE
  v_md RECORD;
  v_seoul_areas TEXT[] := ARRAY['강남', '홍대', '이태원', '건대'];
  v_body TEXT;
  v_budget_text TEXT;
  v_sent_md_ids UUID[] := '{}';
BEGIN
  -- open 상태로 새로 들어오는 깃발만 처리
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  v_budget_text := to_char(NEW.budget_per_person, 'FM999,999,999');
  v_body := format('%s · %s명 · 1인 %s원', NEW.area, NEW.target_count, v_budget_text);

  -- 2-a) 지정 클럽 직접매칭 — 파트너 MD에게 "내 클럽을 콕 집은 깃발" 강한 푸시
  IF NEW.preferred_club_ids IS NOT NULL AND array_length(NEW.preferred_club_ids, 1) > 0 THEN
    FOR v_md IN
      SELECT DISTINCT cp.md_id, c.name AS club_name
      FROM club_partners cp
      JOIN clubs c ON c.id = cp.club_id
      WHERE cp.club_id = ANY(NEW.preferred_club_ids)
        AND cp.md_id <> NEW.leader_id
    LOOP
      -- 푸시 실패(예: http_request_queue url NULL — Migration 455에서도 경고한 known issue)가
      -- 트리거를 타고 올라가 깃발 INSERT 자체를 막으면 안 됨 → 건별로 격리.
      BEGIN
        PERFORM notify_user_push(
          v_md.md_id,
          '⭐ 내 클럽을 콕 집은 깃발',
          format('%s를 원해요 · %s', v_md.club_name, v_body),
          jsonb_build_object(
            'type', 'puzzle_new_club_match',
            'puzzle_id', NEW.id::TEXT,
            'area', NEW.area
          ),
          '/flags/' || NEW.id::TEXT
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'trg_puzzle_push_md_area_match: club-match push failed for %: %', v_md.md_id, SQLERRM;
      END;
      v_sent_md_ids := array_append(v_sent_md_ids, v_md.md_id);
    END LOOP;
  END IF;

  -- 2-b) 지역 구독 푸시 (기존 로직 유지) — 위에서 이미 받은 MD는 제외해 중복 발송 방지
  IF NEW.area = '서울 어디든' THEN
    FOR v_md IN
      SELECT DISTINCT md_id
      FROM md_puzzle_area_subs
      WHERE area = ANY(v_seoul_areas)
        AND md_id <> NEW.leader_id
        AND md_id <> ALL(v_sent_md_ids)
    LOOP
      BEGIN
        PERFORM notify_user_push(
          v_md.md_id,
          '🚩 새 깃발 (서울 어디든)',
          v_body,
          jsonb_build_object(
            'type', 'puzzle_new_in_area',
            'puzzle_id', NEW.id::TEXT,
            'area', NEW.area
          ),
          '/flags/' || NEW.id::TEXT
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'trg_puzzle_push_md_area_match: area push failed for %: %', v_md.md_id, SQLERRM;
      END;
    END LOOP;
  ELSE
    FOR v_md IN
      SELECT md_id
      FROM md_puzzle_area_subs
      WHERE area = NEW.area
        AND md_id <> NEW.leader_id
        AND md_id <> ALL(v_sent_md_ids)
    LOOP
      BEGIN
        PERFORM notify_user_push(
          v_md.md_id,
          '🚩 새 깃발 · ' || NEW.area,
          v_body,
          jsonb_build_object(
            'type', 'puzzle_new_in_area',
            'puzzle_id', NEW.id::TEXT,
            'area', NEW.area
          ),
          '/flags/' || NEW.id::TEXT
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'trg_puzzle_push_md_area_match: area push failed for %: %', v_md.md_id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION trg_puzzle_push_md_area_match()
  IS '새 깃발 INSERT 시: ①지정 클럽(preferred_club_ids) 파트너 MD 직접 매칭 푸시 → ②지역 구독 MD 푸시(①수신자 제외, 중복 방지). 서울 어디든은 서울권 구독자 전부.';

-- 트리거 자체는 기존 것 그대로 유지(함수만 교체됨) — 재생성 불필요하지만 명시적으로 확인
DROP TRIGGER IF EXISTS puzzle_push_md_area_match ON puzzles;
CREATE TRIGGER puzzle_push_md_area_match
  AFTER INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_push_md_area_match();

-- ============================================================================
-- 3) club_demand_counts — 영업용 등록 클럽 수요 집계 뷰 (club_review_summary 패턴 참고)
--    "파트너 없는데 인기 많은 클럽" = 영업 최우선 타겟(has_md=false AND demand_count 높음)
--
--    ⚠️ user_pinned_clubs("자주가는 클럽", 프로필/영구 취향)이 아니라 puzzles.preferred_club_ids
--    ("오늘 가고싶은 클럽", 깃발 한정)를 집계한다 — 둘은 다른 개념(위 §1 주석 참고).
--    실제 "이 클럽을 원하는 깃발이 몇 개 올라왔는지"가 영업 리드로서 더 강한 신호이기도 함.
-- ============================================================================
CREATE OR REPLACE VIEW club_demand_counts AS
SELECT
  c.id,
  c.name,
  c.area,
  c.thumbnail_url,
  COUNT(DISTINCT p.id) AS demand_count,
  EXISTS(SELECT 1 FROM club_partners cp WHERE cp.club_id = c.id) AS has_md
FROM clubs c
LEFT JOIN puzzles p ON c.id = ANY(p.preferred_club_ids)
WHERE c.deleted_at IS NULL AND c.is_test = false
GROUP BY c.id, c.name, c.area, c.thumbnail_url;

COMMENT ON VIEW club_demand_counts IS
  '등록 클럽별 "오늘 가고싶은 클럽" 지정 수요 집계(puzzles.preferred_club_ids 기준, user_pinned_clubs 아님). has_md=false AND demand_count 높음 = 영업 최우선 타겟(/admin/club-requests에서 사용).';
