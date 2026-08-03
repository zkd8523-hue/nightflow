-- Migration 500: deal_amount_total/deal_count_total — 죽어있던 깃발 거래 시그널 복구
--
-- 발견 경위:
--   유저(Ycyc)가 5만원↑ 리뷰를 남기고 admin 승인까지 됐는데도 VIP 등급이 하나도 안 붙어서
--   추적해보니, 269_deal_amount_total.sql의 트리거가 puzzle_offers.visit_marked_at 이
--   NULL→NOT NULL 로 바뀌는 걸 감지해서 금액을 누적하는 구조인데, 그 값을 세팅하던 유일한
--   RPC(request_puzzle_visit_confirm/confirm_puzzle_visit)는 269보다도 먼저,
--   147_simplify_puzzle_visit_md_only.sql 에서 DROP FUNCTION 으로 통째로 삭제됐다.
--   즉 269의 깃발 쪽 트리거는 처음 만들어질 때부터 죽은 입력값을 감시하고 있었던 것 —
--   지금까지 깃발/조각으로 아무리 거래가 성사돼도 deal_amount_total(VIP/VVIP/President
--   등급 기준)에 단 한 번도 반영되지 않았다. (경매 쪽 트리거는 auctions.status='confirmed'
--   를 보므로 정상 동작 중 — 영향 없음.)
--
-- 현재 살아있는 "거래 성사 확정" 시그널은 puzzle_reviews.status='approved' 다:
--   - source='match' (매치 리뷰): INSERT 시 기본값이 이미 'approved' (491:20)
--   - source='visit' (사후 방문 리뷰): submit_visit_review()가 'pending'으로 넣고,
--     어드민이 set_puzzle_review_status()로 'approved'/'rejected' 승인/반려 (491:163-190)
--   이 트리거를 puzzle_offers 가 아니라 puzzle_reviews 위로 옮겨 붙인다.
--
-- ⚠️ 옛 puzzle_offers 트리거(146/269)는 그대로 둔다 — 이제 영원히 안 불릴 뿐 해는 없고,
--    건드릴 이유도 없다.

-- ============================================================
-- 1) 트리거: 리뷰가 approved 되는/벗어나는 순간 → 리더+파트너 양쪽 반영
-- ============================================================
CREATE OR REPLACE FUNCTION sync_deal_stats_on_review_approved()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount BIGINT;
  v_became_approved BOOLEAN;
  v_left_approved BOOLEAN;
BEGIN
  v_became_approved := (TG_OP = 'INSERT' AND NEW.status = 'approved')
    OR (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  v_left_approved := (TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status IS DISTINCT FROM 'approved');

  IF NOT v_became_approved AND NOT v_left_approved THEN
    RETURN NEW;
  END IF;

  SELECT proposed_price INTO v_amount
    FROM puzzle_offers
    WHERE puzzle_id = NEW.puzzle_id AND md_id = NEW.md_id;
  v_amount := COALESCE(v_amount, 0);

  IF v_became_approved THEN
    IF NEW.leader_id IS NOT NULL THEN
      UPDATE users
        SET deal_amount_total = deal_amount_total + v_amount,
            deal_count_total = deal_count_total + 1
        WHERE id = NEW.leader_id;
    END IF;
    IF NEW.md_id IS NOT NULL THEN
      UPDATE users
        SET deal_amount_total = deal_amount_total + v_amount,
            deal_count_total = deal_count_total + 1
        WHERE id = NEW.md_id;
    END IF;
  ELSIF v_left_approved THEN
    -- 승인 취소(리뷰 삭제 요청 승인 등)면 반대로 되돌린다
    IF NEW.leader_id IS NOT NULL THEN
      UPDATE users
        SET deal_amount_total = GREATEST(deal_amount_total - v_amount, 0),
            deal_count_total = GREATEST(deal_count_total - 1, 0)
        WHERE id = NEW.leader_id;
    END IF;
    IF NEW.md_id IS NOT NULL THEN
      UPDATE users
        SET deal_amount_total = GREATEST(deal_amount_total - v_amount, 0),
            deal_count_total = GREATEST(deal_count_total - 1, 0)
        WHERE id = NEW.md_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_stats_on_review_approved ON puzzle_reviews;
CREATE TRIGGER trg_sync_deal_stats_on_review_approved
  AFTER INSERT OR UPDATE OF status ON puzzle_reviews
  FOR EACH ROW EXECUTE FUNCTION sync_deal_stats_on_review_approved();

COMMENT ON FUNCTION sync_deal_stats_on_review_approved() IS
  'Migration 500: puzzle_reviews.status가 approved 되는 순간 leader+md 양쪽 deal_amount_total/
   deal_count_total 반영. 269의 puzzle_offers 트리거를 대체(그쪽은 147에서 이미 죽은 시그널).';

-- ============================================================
-- 2) 백필 — 재실행해도 안전한 전체 재계산 (269의 백필과 동일 패턴).
--    깃발 쪽은 puzzle_reviews.status='approved' 기준으로 다시 계산하고,
--    경매 쪽은 원래부터 정상 작동 중이던 소스를 그대로 재확인한다.
-- ============================================================
UPDATE users u SET
  deal_amount_total = COALESCE((
    SELECT SUM(COALESCE(po.proposed_price, 0))::BIGINT
    FROM puzzle_reviews r
    LEFT JOIN puzzle_offers po ON po.puzzle_id = r.puzzle_id AND po.md_id = r.md_id
    WHERE r.leader_id = u.id AND r.status = 'approved'
  ), 0) + COALESCE((
    SELECT SUM(COALESCE(po.proposed_price, 0))::BIGINT
    FROM puzzle_reviews r
    LEFT JOIN puzzle_offers po ON po.puzzle_id = r.puzzle_id AND po.md_id = r.md_id
    WHERE r.md_id = u.id AND r.status = 'approved'
  ), 0) + COALESCE((
    SELECT SUM(a.current_bid)::BIGINT FROM auctions a
    WHERE a.winner_id = u.id AND a.status = 'confirmed'
  ), 0) + COALESCE((
    SELECT SUM(a.current_bid)::BIGINT FROM auctions a
    WHERE a.md_id = u.id AND a.status = 'confirmed'
  ), 0),
  deal_count_total = COALESCE((
    SELECT COUNT(*) FROM puzzle_reviews r WHERE r.leader_id = u.id AND r.status = 'approved'
  ), 0) + COALESCE((
    SELECT COUNT(*) FROM puzzle_reviews r WHERE r.md_id = u.id AND r.status = 'approved'
  ), 0) + COALESCE((
    SELECT COUNT(*) FROM auctions a WHERE a.winner_id = u.id AND a.status = 'confirmed'
  ), 0) + COALESCE((
    SELECT COUNT(*) FROM auctions a WHERE a.md_id = u.id AND a.status = 'confirmed'
  ), 0);
