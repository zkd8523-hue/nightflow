-- ============================================================================
-- Migration 517: 조각(share) 신규 등록 푸시 전면 차단
-- 날짜: 2026-08-05
-- 배경:
--   상시 조각 자동 발행(505/507)이 붙으면서 조각이 한 번에 여러 건 생성된다.
--   그런데 puzzles INSERT에 걸린 푸시 트리거 두 개가 깃발·조각을 구분하지 않아
--   발행 건마다 푸시가 터졌다.
--
--     ① trg_puzzle_push_md_area_match (504가 최신본) — 그 지역 구독 MD 전원에게
--     ② trg_admin_push_new_puzzle (164)              — admin 전원에게
--
--   ①은 notify_user_push를 5-arg로 호출한다 = 카테고리 토글·방해금지를 우회하는
--   경로라, 유저가 알림을 꺼도 막히지 않는다. 조각 물량이 늘수록 그대로 스팸이 된다.
--
--   조각은 "파트너가 자리를 올린 것"이라 다른 MD에게 알릴 이유가 없고(오히려 경쟁자
--   재고 정보), 유저에게도 건별 푸시가 필요 없다. 깃발(is_recruiting_party=false)은
--   MD가 오퍼를 넣어야 하므로 기존 동작을 그대로 유지한다.
--
--   → is_recruiting_party = true 면 두 트리거 모두 조용히 통과시킨다.
--
--   ⚠️ 되돌리려면 두 함수의 "조각 차단" IF 블록만 제거하면 된다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 지역 구독 MD 푸시 — 조각이면 발송하지 않는다
--    (504 본문 유지, 맨 앞 가드만 추가)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_puzzle_push_md_area_match()
RETURNS TRIGGER AS $$
DECLARE
  v_md RECORD;
  v_seoul_areas TEXT[] := ARRAY['강남', '홍대', '이태원', '건대'];
  v_body TEXT;
  v_budget_text TEXT;
  v_sent_md_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 조각(share)은 푸시 대상이 아니다 (Migration 517)
  IF COALESCE(NEW.is_recruiting_party, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  v_budget_text := to_char(NEW.budget_per_person, 'FM999,999,999');
  v_body := format('%s · %s명 · 1인 %s원', NEW.area, NEW.target_count, v_budget_text);

  -- ① 지정 클럽(preferred_club_ids) 파트너 MD 직접 매칭 (504)
  IF COALESCE(array_length(NEW.preferred_club_ids, 1), 0) > 0 THEN
    FOR v_md IN
      SELECT DISTINCT cp.md_id
      FROM club_partners cp
      WHERE cp.club_id = ANY(NEW.preferred_club_ids)
        AND cp.md_id <> NEW.leader_id
    LOOP
      BEGIN
        PERFORM notify_user_push(
          v_md.md_id,
          '⭐ 내 클럽을 원하는 깃발',
          v_body,
          jsonb_build_object(
            'type', 'puzzle_club_match',
            'puzzle_id', NEW.id::TEXT,
            'area', NEW.area
          ),
          '/flags/' || NEW.id::TEXT
        );
        v_sent_md_ids := array_append(v_sent_md_ids, v_md.md_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'trg_puzzle_push_md_area_match: club push failed for %: %', v_md.md_id, SQLERRM;
      END;
    END LOOP;
  END IF;

  -- ② 지역 구독 MD (①수신자 제외)
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
  IS '새 깃발 INSERT 시 파트너 매칭/지역 구독 MD 푸시. 조각(is_recruiting_party)은 발송 안 함(Migration 517).';

-- ----------------------------------------------------------------------------
-- 2) Admin 푸시 — 조각이면 발송하지 않는다
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_admin_push_new_puzzle()
RETURNS TRIGGER AS $$
DECLARE v_body TEXT;
BEGIN
  -- 조각(share)은 푸시 대상이 아니다 (Migration 517).
  -- 자동 발행으로 하루에도 여러 건이 생겨 admin 알림이 의미를 잃는다.
  IF COALESCE(NEW.is_recruiting_party, false) THEN
    RETURN NEW;
  END IF;

  v_body := format('%s · %s명 · 총 %s원', NEW.area, NEW.target_count,
              to_char(COALESCE(NEW.total_budget, NEW.budget_per_person * NEW.target_count),'FM999,999,999'));
  PERFORM notify_admins_push(
    '🚩 새 깃발이 꽂혔어요!',
    v_body,
    jsonb_build_object('type', 'new_puzzle', 'puzzle_id', NEW.id::TEXT)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_admin_push_new_puzzle()
  IS '새 깃발 INSERT 시 admin 푸시. 조각(is_recruiting_party)은 발송 안 함(Migration 517).';
