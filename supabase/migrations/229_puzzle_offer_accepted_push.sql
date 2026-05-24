-- ============================================================================
-- Migration 229: 오퍼 수락 시 MD에게 FCM 푸시
-- 날짜: 2026-05-24
-- 설명:
--   puzzle_offers.status 가 pending → accepted 로 전환될 때,
--   해당 오퍼의 MD에게 FCM 푸시 발송.
--
--   본문 패턴: "{지역} {M/D} · {클럽명} · {가격} · {인원}명"
--   가격은 만원 단위로 떨어지면 "32만원", 아니면 "320,000원" 폴백.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_puzzle_push_offer_accepted()
RETURNS TRIGGER AS $$
DECLARE
  v_puzzle RECORD;
  v_club_name TEXT;
  v_flag_label TEXT;
  v_price_text TEXT;
  v_body TEXT;
BEGIN
  -- pending → accepted 전환만 처리
  IF NOT (OLD.status = 'pending' AND NEW.status = 'accepted') THEN
    RETURN NEW;
  END IF;

  -- 깃발 정보 조회
  SELECT area, event_date, target_count INTO v_puzzle
  FROM puzzles WHERE id = NEW.puzzle_id;

  IF v_puzzle IS NULL THEN RETURN NEW; END IF;

  -- 깃발 식별자: "홍대 5/25"
  v_flag_label := v_puzzle.area || ' '
                  || EXTRACT(MONTH FROM v_puzzle.event_date)::TEXT || '/'
                  || EXTRACT(DAY FROM v_puzzle.event_date)::TEXT;

  -- 클럽명
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  -- 가격 표기: 만원 단위 떨어지면 "32만원", 아니면 "320,000원"
  IF NEW.proposed_price % 10000 = 0 THEN
    v_price_text := (NEW.proposed_price / 10000)::TEXT || '만원';
  ELSE
    v_price_text := to_char(NEW.proposed_price, 'FM999,999,999') || '원';
  END IF;

  -- 본문: "홍대 5/25 · BURN 강남 · 32만원 · 4명"
  v_body := v_flag_label || ' · ' || COALESCE(v_club_name, '클럽')
            || ' · ' || v_price_text
            || ' · ' || v_puzzle.target_count::TEXT || '명';

  PERFORM notify_user_push(
    NEW.md_id,
    '🚩 오퍼가 수락됐어요!',
    v_body,
    jsonb_build_object(
      'type', 'puzzle_offer_accepted',
      'puzzle_id', NEW.puzzle_id::TEXT,
      'offer_id', NEW.id::TEXT
    ),
    '/flags/' || NEW.puzzle_id::TEXT
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS puzzle_push_offer_accepted ON puzzle_offers;
CREATE TRIGGER puzzle_push_offer_accepted
  AFTER UPDATE OF status ON puzzle_offers
  FOR EACH ROW EXECUTE FUNCTION trg_puzzle_push_offer_accepted();

COMMENT ON FUNCTION trg_puzzle_push_offer_accepted()
  IS '오퍼 수락 시 (pending→accepted) MD에게 FCM 푸시. accept_offer() 호출 시 자동 발동.';
