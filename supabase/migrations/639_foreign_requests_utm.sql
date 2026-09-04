-- 외국인 컨시어지 요청(foreign_requests)에 유입 채널 컬럼 추가.
--
-- 배경: 구글애즈 등 유료 광고 집행을 검토 중인데, 지금은 어느 채널의 클릭이
-- 실제 요청 제출로 이어졌는지 측정할 방법이 없다 — 이 테이블에 유입 정보가
-- 전혀 없었다(lang·contact_type만 있음). 광고를 켜기 전에 반드시 필요한 선행 작업.
--
-- 값의 출처: 클라이언트에 이미 있는 세션 단위 UTM 캡처(src/lib/analytics/
-- userEvents.ts의 getOrRotateSession)를 그대로 재사용한다 — 새 파싱 로직을
-- 만들지 않고 기존 SSOT에서 읽기만 한다.
ALTER TABLE foreign_requests
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS landing_path TEXT;

-- admin 채널별 집계용
CREATE INDEX IF NOT EXISTS idx_foreign_requests_utm_source
  ON foreign_requests(utm_source, created_at DESC);
