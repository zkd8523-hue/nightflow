-- ============================================================================
-- Migration 329: 미선택 마감 깃발의 오퍼 슬롯 누수 수정
-- 날짜: 2026-06-26
-- 설명:
--   [버그] MD가 제안한 깃발이 "미선택"으로 자동 마감(expired)되어도
--     · 그 깃발의 pending 오퍼는 영원히 'pending'으로 남고
--     · users.md_active_offers_count 가 줄지 않음
--   → 카운터가 부풀어 'md_active_offers_count >= 5'에 걸려 새 오퍼 차단.
--
--   원인:
--     · 자동 만료 경로(Edge Function expire-puzzles / 구 notify_and_expire_puzzles)는
--       puzzles.status만 expired로 바꾸고 오퍼/슬롯을 정리하지 않았음.
--     · 슬롯 정리(-1)는 accept_offer/reject_offer/withdraw_offer RPC에만 존재.
--
--   수정 (3겹):
--     1) submit_offer 슬롯 체크를 카운터 대신 "진행중(open/selecting) 깃발의
--        pending 오퍼 실제 COUNT"로 전환 → 카운터 드리프트 면역 (Migration 122 의도 복원)
--     2) sync_md_offer_slots(): 종료된 깃발에 박제된 pending 오퍼를 expired로 정리하고
--        모든 MD/Admin의 md_active_offers_count를 실제 pending 수로 재동기화.
--        Edge Function expire-puzzles 가 매분 호출 → 앞으로 누수 방지.
--     3) 본 마이그레이션 말미에서 sync_md_offer_slots() 1회 실행 → 누적 피해 즉시 복구.
-- 참조: Migration 168(현행 submit_offer), 122(COUNT 기반 체크 시도), 220(expire cron)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) submit_offer: 슬롯 체크를 실제 활성 오퍼 COUNT 기반으로 전환
--    (168 본문 그대로, 슬롯 체크 블록만 교체)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_offer(
  p_puzzle_id UUID,
  p_club_id UUID,
  p_table_type TEXT,
  p_proposed_price INTEGER,
  p_includes TEXT[],
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_md users%ROWTYPE;
  v_puzzle puzzles%ROWTYPE;
  v_current_budget INTEGER;
  v_active_offers INTEGER;
BEGIN
  SELECT * INTO v_md FROM users WHERE id = auth.uid() FOR UPDATE;
  SELECT * INTO v_puzzle FROM puzzles WHERE id = p_puzzle_id;

  IF v_puzzle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '깃발을 찾을 수 없습니다');
  END IF;
  IF v_md.role NOT IN ('md', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'MD 또는 관리자만 제안할 수 있습니다');
  END IF;
  IF v_md.role = 'md' AND v_md.md_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', '승인된 MD만 제안할 수 있습니다');
  END IF;
  IF v_puzzle.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', '모집이 종료된 깃발입니다');
  END IF;
  IF v_puzzle.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', '마감된 깃발입니다');
  END IF;

  -- 동시 활성 오퍼: 진행중(open/selecting) 깃발의 pending 오퍼만 실제 COUNT
  -- (카운터 md_active_offers_count 가 어긋나도 차단되지 않도록 — 드리프트 면역)
  SELECT COUNT(*) INTO v_active_offers
  FROM puzzle_offers po
  JOIN puzzles pz ON pz.id = po.puzzle_id
  WHERE po.md_id = auth.uid()
    AND po.status = 'pending'
    AND pz.status IN ('open', 'selecting');

  IF v_active_offers >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', '동시 활성 오퍼는 최대 5건입니다');
  END IF;

  IF v_md.md_daily_offers_reset_at IS DISTINCT FROM CURRENT_DATE THEN
    UPDATE users SET
      md_daily_offers_count = 0,
      md_daily_offers_reset_at = CURRENT_DATE
    WHERE id = auth.uid();
    v_md.md_daily_offers_count := 0;
  END IF;
  IF v_md.md_daily_offers_count >= 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '일일 제안 횟수(6건)를 초과했습니다');
  END IF;

  -- 예산 계산: 프론트엔드(OfferSheet.tsx)와 동일한 로직
  IF v_puzzle.current_count = v_puzzle.target_count THEN
    v_current_budget := COALESCE(
      v_puzzle.total_budget,
      v_puzzle.budget_per_person * v_puzzle.target_count
    );
  ELSE
    v_current_budget := COALESCE(
      ROUND(v_puzzle.total_budget::NUMERIC * v_puzzle.current_count
            / NULLIF(v_puzzle.target_count, 0))::INTEGER,
      v_puzzle.budget_per_person * v_puzzle.current_count
    );
  END IF;

  IF p_proposed_price <> v_current_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('제안가는 예산과 동일해야 합니다 (예산: %s원)', v_current_budget)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM puzzle_offers
    WHERE puzzle_id = p_puzzle_id AND md_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 제안한 깃발입니다');
  END IF;

  INSERT INTO puzzle_offers (puzzle_id, md_id, club_id, table_type, proposed_price, includes, comment)
  VALUES (p_puzzle_id, auth.uid(), p_club_id, p_table_type, p_proposed_price, COALESCE(p_includes, '{}'), p_comment);

  -- 카운터는 실제 활성 수 + 1로 동기화 (드리프트 누적 방지)
  UPDATE users SET
    md_active_offers_count = v_active_offers + 1,
    md_daily_offers_count = md_daily_offers_count + 1,
    md_daily_offers_reset_at = CURRENT_DATE
  WHERE id = auth.uid();

  INSERT INTO in_app_notifications (user_id, type, title, message)
  VALUES (
    v_puzzle.leader_id,
    'puzzle_offer_received',
    'MD 제안 도착',
    'MD가 회원님의 깃발에 제안서를 보냈습니다. 확인해보세요!'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 2) sync_md_offer_slots(): 박제된 오퍼 정리 + 카운터 재동기화
--    · 종료된 깃발(open/selecting 아님)에 남은 pending 오퍼 → expired
--    · 모든 MD/Admin의 md_active_offers_count = 실제 pending 오퍼 수
--    Edge Function expire-puzzles 가 매분 호출. 단독 실행 시 백필 역할도 함.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_md_offer_slots()
RETURNS JSONB AS $$
DECLARE
  v_expired_offers INTEGER := 0;
  v_resynced_mds INTEGER := 0;
BEGIN
  -- (a) 종료된 깃발에 박제된 pending 오퍼를 expired 처리
  WITH released AS (
    UPDATE puzzle_offers po
       SET status = 'expired', updated_at = now()
      FROM puzzles pz
     WHERE pz.id = po.puzzle_id
       AND po.status = 'pending'
       AND pz.status NOT IN ('open', 'selecting')
    RETURNING po.id
  )
  SELECT COUNT(*) INTO v_expired_offers FROM released;

  -- (b) MD/Admin 카운터를 실제 pending 오퍼 수로 재동기화
  WITH resynced AS (
    UPDATE users u
       SET md_active_offers_count = COALESCE(c.cnt, 0)
      FROM (
        SELECT u2.id,
               (SELECT COUNT(*) FROM puzzle_offers po
                 WHERE po.md_id = u2.id AND po.status = 'pending') AS cnt
        FROM users u2
        WHERE u2.role IN ('md', 'admin')
      ) c
     WHERE u.id = c.id
       AND u.md_active_offers_count IS DISTINCT FROM c.cnt
    RETURNING u.id
  )
  SELECT COUNT(*) INTO v_resynced_mds FROM resynced;

  RETURN jsonb_build_object(
    'success', true,
    'expired_offers', v_expired_offers,
    'resynced_mds', v_resynced_mds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_md_offer_slots() TO service_role;


-- ----------------------------------------------------------------------------
-- 3) 백필: 누적된 박제 오퍼 정리 + 전체 카운터 재동기화 1회 실행
-- ----------------------------------------------------------------------------
SELECT sync_md_offer_slots();
