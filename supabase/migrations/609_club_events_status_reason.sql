-- club_events 에 "왜 이 상태가 됐는지"를 남긴다.
--
-- 배경(2026-08-30): flagged 31건·rejected 68건이 왜 그렇게 됐는지 기록이 전혀
-- 없어서, 원인을 찾으려고 캡션·파싱결과·코드를 하나씩 대조해야 했다. 결국 원인은
-- isHipHopVenue 게이트("힙합플레이야가 다룬 적 있는 클럽인가")의 순환 참조였고,
-- 그 31건은 전부 진짜 공연이었다 — NAFLA·Colde·PALOALTO·BE'O 공연이 몇 달째
-- 묻혀 있었다. 사유를 안 남기면 같은 일이 반복되고, 반복돼도 알아채지 못한다.
--
-- 자유 문자열로 둔다. 판정 지점이 여러 곳이고(자동 판정 / 재분류 스크립트 /
-- 관리자), 앞으로 늘어날 사유를 enum 으로 고정하면 그때마다 마이그레이션이 필요하다.
-- 대신 아래 COMMENT 에 현재 쓰는 값을 적어 둔다.

ALTER TABLE club_events ADD COLUMN IF NOT EXISTS status_reason TEXT;

COMMENT ON COLUMN club_events.status_reason IS
  'status가 approved가 아닐 때 그 사유. 자동 판정이 쓰는 값: '
  'no_date(날짜 없음) / past(어제 이전) / too_far(6개월 초과) / '
  'no_lineup(출연자 없음) / overseas(해외) / unregistered_venue(미등록 장소에서 가수 공연) / '
  'reclassified_dj(재분류: 가수 없는 DJ 파티). 관리자 수동 조치는 자유 서술.';

-- 조회용 — 어떤 사유가 얼마나 쌓이는지 보려면 status_reason 으로 묶는다.
CREATE INDEX IF NOT EXISTS idx_club_events_status_reason
  ON club_events (status_reason)
  WHERE status_reason IS NOT NULL;
