-- 474: 관리자의 깃발/조각 수정 권한
--
-- 배경: 유저가 인원을 잘못 등록해도(예: 실제 3명인데 4명) 운영팀이 고쳐줄 방법이 없었다.
-- puzzles UPDATE 정책이 "Leader can update own puzzle" (auth.uid() = leader_id) 하나뿐이라
-- admin이 UI를 통과해도 RLS에서 막혔다.
--
-- 범위: 인원/예산/선호 등 내용 교정용. 강제 종료는 기존 AdminCancelPuzzleButton 유지.
-- 대기 중 오퍼가 있으면 기존 트리거(prevent_puzzle_edit_with_offers)가 admin에게도 그대로 적용된다
-- — MD가 이미 제안한 조건이 밑에서 바뀌면 안 되므로 의도된 동작.

DROP POLICY IF EXISTS "Admin can update any puzzle" ON puzzles;
CREATE POLICY "Admin can update any puzzle" ON puzzles
  FOR UPDATE USING (public.is_admin());

-- 방장의 puzzle_members.guest_count도 인원에 맞춰 동기화해야 하는데
-- 기존 정책은 "Users can manage own membership" (auth.uid() = user_id)뿐이라
-- admin이 남의 멤버 행을 못 고친다.
DROP POLICY IF EXISTS "Admin can update any membership" ON puzzle_members;
CREATE POLICY "Admin can update any membership" ON puzzle_members
  FOR UPDATE USING (public.is_admin());
