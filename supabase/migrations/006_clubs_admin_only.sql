-- ================================
-- 클럽 관리 권한 변경: MD 생성 가능 -> Admin 전용
-- ================================

-- 기존에 'MD can create clubs' 정책이 있다면 삭제 (이전에는 없었던 것 같지만, 혹시 모를 충돌을 위해 삭제)
DROP POLICY IF EXISTS "MD can manage own clubs" ON clubs;
DROP POLICY IF EXISTS "MD can create clubs" ON clubs;

-- 모두 읽을 수 있음
CREATE POLICY "Anyone can read clubs"
  ON clubs FOR SELECT
  TO authenticated
  USING (true);

-- Admin만 Insert, Update, Delete 가능
CREATE POLICY "Admins can insert clubs"
  ON clubs FOR INSERT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update clubs"
  ON clubs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete clubs"
  ON clubs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
