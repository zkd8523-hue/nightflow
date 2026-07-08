-- Migration 423: LIVE/SHOT 게시 시 지역 인증 요구 제거
--
-- 배경: 404 정책은 area 지정 SHOT(=LIVE)에 has_active_area_verification을 요구했다.
--   그러나 420(LIVE 전국 허용) + 클럽 픽 GPS 근접으로 area 인증은 불필요해졌고,
--   인증이 없거나 만료되면 "지역 인증 만료"로 게시가 100% 막혀 이탈 발생.
-- 해결: 로그인 + 본인 + 정상계정이면 게시 허용. GPS 근접은 클라이언트 클럽 픽에서 보장.

DROP POLICY IF EXISTS "Verified users can post shots" ON chat_shots;
DROP POLICY IF EXISTS "Anyone can post general shots" ON chat_shots;
DROP POLICY IF EXISTS "Anyone can post shots" ON chat_shots;

CREATE POLICY "Anyone can post shots"
  ON chat_shots
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
    AND NOT public.is_blocked_or_deleted(auth.uid())
  );

COMMENT ON POLICY "Anyone can post shots" ON chat_shots IS
  'Migration 423: 지역 인증 제거. 로그인+본인+정상계정이면 LIVE/일반 SHOT 게시 가능.';
