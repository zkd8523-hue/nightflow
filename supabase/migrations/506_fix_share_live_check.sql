-- ============================================================================
-- Migration 506: chk_auction_templates_live 완화 (505 후속 수정)
-- 날짜: 2026-08-05
-- 배경:
--   505의 CHECK에 `live_until <= CURRENT_DATE + INTERVAL '28 days'`가 들어 있어
--   두 가지 문제가 생겼다.
--
--   1) 시간대 불일치 — 클라이언트는 KST 기준으로 "오늘+28일"을 계산하는데
--      CURRENT_DATE는 서버(UTC) 기준이다. KST가 UTC보다 하루 앞선 시간대(00:00~08:59 UTC)에는
--      클라이언트 계산값이 상한을 하루 초과해 INSERT/UPDATE가 거부된다.
--      → 실제로 토글을 켜면 "violates check constraint" 오류.
--
--   2) 시간 의존 CHECK의 구조적 위험 — CURRENT_DATE는 시간이 지나면 값이 변한다.
--      CHECK는 해당 행을 UPDATE할 때마다 재평가되므로, 저장 시점엔 유효했던 행이
--      나중에 요일 하나만 바꾸려 해도 무관한 이유로 실패할 수 있다.
--
--   4주 상한은 "켜놓고 잊은 템플릿" 방지용 가드일 뿐이고, 좀비 공급은
--   sweep_live_shares()의 empty_streak 자동 OFF가 이미 막는다.
--   따라서 상한은 UI(MAX_LIVE_DAYS)에서만 강제하고, DB CHECK는 구조적 불변식만 남긴다:
--   "is_live=true면 live_until과 live_dows가 반드시 있어야 한다".
-- ============================================================================

ALTER TABLE auction_templates DROP CONSTRAINT IF EXISTS chk_auction_templates_live;
ALTER TABLE auction_templates ADD CONSTRAINT chk_auction_templates_live
  CHECK (
    is_live = false
    OR (
      live_until IS NOT NULL
      AND COALESCE(array_length(live_dows, 1), 0) > 0
    )
  );
