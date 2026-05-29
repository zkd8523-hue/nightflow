-- ============================================================================
-- Migration 270: 사용자 활동 시 users.last_seen_at 자동 갱신
--
-- 문제:
--   client에서 호출하는 touch_last_seen()이 providers.tsx 마운트 + 1시간 throttle에
--   의존해서, 깃발 등록 같은 능동 액션 직후에도 last_seen_at이 옛 값으로 남는
--   케이스 발생 (예: 1시간 전 깃발 등록했는데 마지막 접속 9일 전으로 표시).
--
-- 해결:
--   주요 활동 테이블 INSERT 시 트리거로 행위자(actor)의 users.last_seen_at = now() 갱신.
--   대상 테이블: puzzles, puzzle_members, puzzle_offers, share_join_clicks, bids
--
--   - 트리거는 SECURITY DEFINER 함수로 RLS 우회
--   - actor 컬럼 매핑: puzzles.leader_id, puzzle_members.user_id,
--     puzzle_offers.offerer_id, share_join_clicks.user_id, bids.bidder_id
--   - NULL이면 skip (비로그인 share_join_clicks 등)
-- ============================================================================

CREATE OR REPLACE FUNCTION touch_user_last_seen(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE users SET last_seen_at = now() WHERE id = p_user_id;
END;
$$;

-- puzzles (깃발 등록)
CREATE OR REPLACE FUNCTION trg_puzzles_touch_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM touch_user_last_seen(NEW.leader_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puzzles_touch_last_seen ON puzzles;
CREATE TRIGGER puzzles_touch_last_seen
  AFTER INSERT ON puzzles
  FOR EACH ROW EXECUTE FUNCTION trg_puzzles_touch_last_seen();

-- puzzle_members (깃발 참여)
CREATE OR REPLACE FUNCTION trg_puzzle_members_touch_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM touch_user_last_seen(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puzzle_members_touch_last_seen ON puzzle_members;
CREATE TRIGGER puzzle_members_touch_last_seen
  AFTER INSERT ON puzzle_members
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_members_touch_last_seen();

-- puzzle_offers (깃발 오퍼)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'puzzle_offers') THEN
    CREATE OR REPLACE FUNCTION trg_puzzle_offers_touch_last_seen()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      PERFORM touch_user_last_seen(NEW.offerer_id);
      RETURN NEW;
    END;
    $f$;
    DROP TRIGGER IF EXISTS puzzle_offers_touch_last_seen ON puzzle_offers;
    CREATE TRIGGER puzzle_offers_touch_last_seen
      AFTER INSERT ON puzzle_offers
      FOR EACH ROW EXECUTE FUNCTION trg_puzzle_offers_touch_last_seen();
  END IF;
END $$;

-- share_join_clicks (조각 참여 클릭)
CREATE OR REPLACE FUNCTION trg_share_join_clicks_touch_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM touch_user_last_seen(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS share_join_clicks_touch_last_seen ON share_join_clicks;
CREATE TRIGGER share_join_clicks_touch_last_seen
  AFTER INSERT ON share_join_clicks
  FOR EACH ROW EXECUTE FUNCTION trg_share_join_clicks_touch_last_seen();

-- bids (조각 입찰)
CREATE OR REPLACE FUNCTION trg_bids_touch_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM touch_user_last_seen(NEW.bidder_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bids_touch_last_seen ON bids;
CREATE TRIGGER bids_touch_last_seen
  AFTER INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION trg_bids_touch_last_seen();
