-- ============================================================================
-- Migration 587: 파티(조각) 상담 무료화
-- 날짜: 2026-08-27
-- 설명: 오퍼 개념을 "파트너 한마디 + 유저가 채팅 시작"으로 재배치하면서
--       파티 상담을 무료로 전환한다.
--
--       puzzle_match_credit_cost 하나만 바꾸면 초대(invite_md_to_party)·
--       수락(accept_offer)·첫답장(send_offer_message)·상담시작
--       (start_party_consultation) 모든 과금 지점에 전파된다. (Migration 358 참조)
--
--       start_party_consultation의 동의·시스템 메시지·멱등 로직은 그대로 살아있고
--       차감액만 0이 된다. puzzle_offers.charged_at 기록도 유지되므로
--       나중에 유료로 되돌릴 때 이 파일만 뒤집으면 된다.
--
--       깃발(is_recruiting_party=false)은 15 유지 — UI는 이미 제거됐지만
--       레거시 데이터가 남아 있어 건드리지 않는다.
--
--       크레딧 제도 자체는 유지 (충전·잔액·계좌이체 적립·게스트 간판 등 타 용도).
-- ============================================================================
CREATE OR REPLACE FUNCTION puzzle_match_credit_cost(p_puzzle_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN p.is_recruiting_party THEN 0 ELSE 15 END
  FROM puzzles p WHERE p.id = p_puzzle_id;
$$;
