-- Migration 420: LIVE 전국 허용 — area 일치 강제 제거
--
-- 배경: 419까지 트리거가 club.area ∈ {강남,홍대,이태원} 이고 작성자 area와 일치해야만
--       LIVE를 허용. 그러나 클럽은 전국(부산/대구 등)에 있고, LIVE 클럽 픽은 이미
--       GPS 가까운 순으로 노출(=물리적으로 근처)이라 area 코드 일치 강제는 부적합.
--       → "인증된 지역과 클럽 지역이 달라요"로 정상 게시가 막힘.
--
-- 해결: club_id 유효성만 검증. area 일치 검사 제거 → 클럽이 있는 어느 지역이든 LIVE 가능.
--       (GPS 근접은 클라이언트 클럽 픽에서 이미 보장. 서버 GPS 검증은 후속 과제.)

CREATE OR REPLACE FUNCTION enforce_live_post_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_exists BOOLEAN;
BEGIN
  -- club_id 미지정 = 일반 SHOT — 규칙 없음
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- club_id 지정 LIVE: 클럽 존재 여부만 확인 (전국 허용)
  SELECT EXISTS (SELECT 1 FROM clubs WHERE id = NEW.club_id AND deleted_at IS NULL)
    INTO v_club_exists;
  IF NOT v_club_exists THEN
    RAISE EXCEPTION 'LIVE_INVALID_CLUB: 선택한 클럽을 찾을 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_live_post_rules() IS
  'Migration 420: LIVE는 클럽 존재만 검증(전국 허용). area 일치 강제 제거.';
