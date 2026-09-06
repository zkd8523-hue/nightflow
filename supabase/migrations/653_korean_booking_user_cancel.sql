-- ============================================================================
-- Migration 653: 한국인 예약 요청 — 본인 취소 허용
--
-- 배경: 예약자가 신청 정보를 잘못 입력했거나 마음이 바뀌었을 때, 운영자가
--      아직 확인(연락)하기 전(status='new')이라면 본인이 직접 취소할 수 있어야
--      한다. 이미 운영자가 MD에게 연락을 시작한 뒤(contacted 이후)는 임의로
--      취소하면 운영자-MD 소통과 어긋날 수 있어, 그 단계부터는 고객센터로 안내.
--
-- foreign_requests에는 이런 본인 취소 정책이 없다(운영자 전담) — 한국 트랙만
-- 로그인 필수라 본인 확인이 가능해서 이 기능을 추가한다.
-- ============================================================================

CREATE POLICY "user cancels own korean booking request while new" ON korean_booking_requests
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'new')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');
