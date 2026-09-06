-- ============================================================================
-- Migration 661: 환율 스냅샷 테이블 + 주 1회 동기화 cron
-- 날짜: 2026-09-07
-- 배경:
--   환율을 Next fetch 캐시(15일)에만 맡겨왔다. 세 가지가 문제였다.
--     1) 캐시는 요청이 와야 갱신된다 — 15일이 지난 뒤 첫 손님이 stale을 본다
--     2) 재배포하면 캐시가 날아가 외부 API 지연을 손님이 그대로 맞는다
--     3) open.er-api.com이 죽으면 코드에 박힌 2026-08 폴백으로 조용히 떨어진다
--   실제로 2026-06 고정값이 8월에 위안화 기준 10% 어긋난 적이 있다.
--
--   주 1회 cron이 받아서 이 테이블에 적재하고, 앱은 최신 행만 읽는다.
--   외부 호출 경로가 cron 하나로 줄어 실패도 로그로 남는다.
--
--   주 1회인 이유: 화면 참고용 근사치다. 실결제는 전액 원화이므로(Model B)
--   주중 환율 변동이 청구액을 바꾸지 않는다. 일 1회는 API 호출만 7배가 된다.
--
--   신청서에 환산가를 남기지 않는 이유: 손님이 내는 금액은 원화이고 그 값은
--   selected_menu 스냅샷에 이미 박힌다. 환산가는 "대충 이 정도" 참고값이라
--   분쟁 대상이 아니다. 이 테이블은 분쟁 근거가 아니라 운영 로그다 —
--   cron이 언제 실패했고 폴백으로 며칠 버텼는지 보기 위한 것.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 통화를 컬럼이 아닌 jsonb로 두면 통화를 늘려도 마이그레이션이 필요 없다.
  -- 형태: {"USD": 0.000706, "JPY": 0.112, ...} — 1 KRW = value * 해당통화
  rates       JSONB NOT NULL,
  source      TEXT NOT NULL DEFAULT 'open.er-api.com',
  -- 외부 조회에 실패해 코드 폴백값을 적재한 행. 조회는 여전히 최신 행을 쓰되,
  -- 이 플래그로 "며칠째 진짜 환율을 못 받고 있는지" 확인한다.
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 조회는 항상 "최신 1행"이다.
CREATE INDEX IF NOT EXISTS idx_fx_snapshots_fetched
  ON fx_rate_snapshots (fetched_at DESC);

ALTER TABLE fx_rate_snapshots ENABLE ROW LEVEL SECURITY;

-- 환율은 공개 정보다. 앱(anon)이 최신 행을 직접 읽는다.
DROP POLICY IF EXISTS "anyone reads fx snapshots" ON fx_rate_snapshots;
CREATE POLICY "anyone reads fx snapshots" ON fx_rate_snapshots
  FOR SELECT USING (true);

-- 쓰기는 Edge Function(service_role)만. service_role은 RLS를 우회하므로
-- 별도 INSERT 정책을 두지 않는다 — 즉 anon/authenticated는 쓸 수 없다.

-- 첫 행 — cron이 처음 돌기 전에도 앱이 테이블에서 값을 얻도록 폴백값을 심는다.
-- (2026-08-11 조회값. currency.ts FALLBACK_SNAPSHOT과 같은 값)
INSERT INTO fx_rate_snapshots (rates, source, is_fallback, fetched_at)
SELECT
  jsonb_build_object(
    'USD', 1.0 / 1416, 'JPY', 1.0 / 8.92, 'CNY', 1.0 / 209, 'TWD', 1.0 / 44,
    'HKD', 1.0 / 181, 'SGD', 1.0 / 1101, 'THB', 1.0 / 42.8, 'VND', 1.0 / 0.0536
  ),
  'seed', true, '2026-08-11T00:00:00Z'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM fx_rate_snapshots);

-- ---------------------------------------------------------------------------
-- cron: 매주 월요일 03:00 KST (일요일 18:00 UTC)
--   - 요일: 클럽 이벤트 수집(571)이 수요일이라 겹치지 않게 벌린다.
--   - 시각: 주말 영업이 끝난 뒤이자 트래픽이 가장 뜸한 새벽.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'sync-fx-rates'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'sync-fx-rates',
  '0 18 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/sync-fx-rates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
