-- ============================================================================
-- Migration 666: 클럽 단위 "외국인 예약 중개 상의 완료" 플래그
--
-- 배경(2026-09-10): isBookable()이 has_menu && has_md를 요구하도록 원복했다
-- (메뉴판만 있고 클럽과 상의된 적 없는 B1류가 bookable로 노출되던 버그 수정).
-- 그런데 has_md는 club_partners에 MD가 실제로 회원가입·연결돼야 생기는데,
-- 사장님 결정(2026-09-10): 이제부터 진행할 콜드 DM 영업은 "클럽이 구두로
-- 승인" → 즉시 bookable 전환 → 실제 주문이 들어온 뒤에야 파트너 가입을
-- 요청하는 순서로 간다. MD 연결을 기다리면 bookable 전환이 주문보다 늦어져
-- 이 순서 자체가 성립하지 않는다.
--
-- 그래서 "DM으로 상의·승인됐다"는 사실 자체를 클럽 단위로 기록하는 플래그를
-- 새로 둔다. club_partners(누가 담당하는가)와는 별개 축이다 — 이건 "그 클럽이
-- 예약 중개에 동의했는가"만 본다. isBookable()은 has_md 대신 이 플래그를
-- (또는 has_md를) 보도록 다음 커밋에서 바뀐다.
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS foreign_booking_agreed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clubs.foreign_booking_agreed IS
  '외국인 예약 중개를 클럽과 상의·승인 완료했는지(콜드 DM 결과). club_partners(담당 MD 연결)와는 별개 축 — '
  '이 플래그만으로 isBookable()이 예약 가능으로 판정한다. 승인 시점에 MD가 아직 없어도 무방하고, '
  '실제 주문이 들어온 뒤 파트너 가입을 요청하는 순서를 쓴다(2026-09-10 사장님 결정).';

-- 지금 이미 club_partners로 실제 상의·연결된 클럽들은 소급 승인 처리.
-- (has_md인 클럽은 당연히 상의가 끝난 상태이므로 플래그를 켜준다 — 새로 DM할 필요 없음)
UPDATE clubs c
SET foreign_booking_agreed = TRUE
WHERE EXISTS (SELECT 1 FROM club_partners p WHERE p.club_id = c.id);

-- ─── 승인 완료 클럽 (콜드 DM / 구두 합의로 확인된 곳) ──────────────────────
-- Lion Super Club(강남): 주대 49개가 이미 등록돼 있고 클럽과 승인도 끝났는데
-- club_partners가 0이라 지금껏 예약 불가로 묶여 있었다. 이 플래그의 첫 대상.
-- (foreign-booking-checklist.md D절 "MD 있는 걸로 쳐도 된다" 건)
UPDATE clubs
SET foreign_booking_agreed = TRUE
WHERE name = 'Lion Super Club' AND deleted_at IS NULL;
