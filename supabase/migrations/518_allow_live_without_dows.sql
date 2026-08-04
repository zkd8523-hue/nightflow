-- ============================================================================
-- Migration 518: 켜진 채 요일이 비어 있는 상태 허용
-- 날짜: 2026-08-05
-- 배경:
--   510의 CHECK가 "is_live=true면 live_dows가 최소 1개"를 강제했다. 그래서 요일 프리셋을
--   해제해 요일을 다 비우면 마스터 스위치까지 같이 꺼져버렸다.
--   MD 입장에선 "요일만 지웠는데 왜 전체가 꺼지지?"가 된다 — 끄는 건 오른쪽 토글의 역할이고,
--   요일 칩/프리셋은 언제 올릴지만 정하는 것이라 둘이 섞이면 안 된다.
--
--   is_live=true + live_dows=[] 는 "켜뒀지만 아직 요일 미정" 상태로 안전하다:
--     · publish_share_template: 어떤 날짜도 live_dows에 매칭되지 않아 발행 0건
--     · sweep_live_shares: 요일이 규칙에서 빠진 미래 발행분을 회수 (516)
--   즉 아무것도 올라가지 않으며, MD가 요일을 고르는 순간 다시 돈다.
--
--   남은 규칙이 없으므로 제약 자체를 제거한다.
-- ============================================================================

ALTER TABLE auction_templates DROP CONSTRAINT IF EXISTS chk_auction_templates_live;

COMMENT ON COLUMN auction_templates.live_dows IS
  '운영 요일(mon~sun). is_live=true여도 비어 있을 수 있다 — "켜뒀지만 요일 미정"(Migration 518).';
