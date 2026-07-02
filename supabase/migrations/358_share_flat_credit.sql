-- ============================================================================
-- Migration 358: 조각 매치 크레딧 정액 10 (구간제 8/15 폐기)
-- 날짜: 2026-07-02
-- 설명: 조각(is_recruiting_party=true) 매치 = 정액 10크레딧. 깃발 = 15.
--       puzzle_match_credit_cost 하나만 바꾸면 초대(invite)·수락(accept)·
--       첫답장(send_offer_message) 모든 과금 지점에 전파됨.
-- ============================================================================
CREATE OR REPLACE FUNCTION puzzle_match_credit_cost(p_puzzle_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN p.is_recruiting_party THEN 10 ELSE 15 END
  FROM puzzles p WHERE p.id = p_puzzle_id;
$$;
