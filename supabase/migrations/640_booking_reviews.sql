-- ============================================================================
-- Migration 640: 예약 리뷰 (booking_reviews)
--
-- 배경: 손님이 확인서 페이지에서 클럽/MD 리뷰를 남길 수 있게 한다.
--      puzzle_reviews(260)는 puzzle_id에 종속돼 있어 깃발 전용 구조이고,
--      깃발은 폐기된 트랙(project_flag_deprecated)이라 그대로 재사용할 수
--      없다. booking_confirmations(request_id) 기준으로 새로 만든다.
--
-- 입장 완료 여부와 무관하게 리뷰 작성은 항상 허용한다 — MD가 "입장 완료"를
-- 안 누른 채로 방문이 끝나는 경우가 실제로 있을 수 있어서, 그 확인을
-- 리뷰 작성의 필수 조건으로 걸면 안 된다. 대신 화면에는 입장 확인 여부에
-- 따라 다른 안내 문구를 보여준다(신뢰도 표시 목적, UI 레벨 처리).
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES foreign_requests(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  md_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_reviews_club_id
  ON booking_reviews (club_id);
CREATE INDEX IF NOT EXISTS idx_booking_reviews_md_id
  ON booking_reviews (md_id);

COMMENT ON TABLE booking_reviews IS
  '외국인 예약 확인서에서 손님이 남기는 클럽/MD 리뷰. 1예약 = 1리뷰.';

ALTER TABLE booking_reviews ENABLE ROW LEVEL SECURITY;

-- 손님은 비로그인으로 확인서를 열기 때문에 클라이언트 직접 INSERT를 허용하지
-- 않는다(스팸/변조 방지). 서버 라우트(service role)가 public_token을 검증한
-- 뒤에만 기록한다.
CREATE POLICY "public reads booking reviews" ON booking_reviews
  FOR SELECT USING (true);

CREATE POLICY "admin manages booking reviews" ON booking_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS booking_reviews_updated_at ON booking_reviews;
CREATE TRIGGER booking_reviews_updated_at
  BEFORE UPDATE ON booking_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
