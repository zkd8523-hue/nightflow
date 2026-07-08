-- Migration 419: LIVE 트리거의 잘못된 컬럼 참조 수정 (author_area → area)
--
-- 문제: 341/413의 enforce_live_post_rules() 트리거가 NEW.author_area 를 참조하는데
--       chat_shots 에는 author_area 컬럼이 없다 (author_area는 285에서 chat_messages에만 추가됨).
--       chat_shots는 작성자 인증 지역을 'area' 컬럼(gangnam/hongdae/itaewon)에 저장한다.
--       → club_id 지정 LIVE INSERT 시 "column author_area does not exist"(42703)로 실패,
--         프론트에서 "DB 마이그레이션 미적용(413)"으로 오표시됨.
--
-- 해결: 트리거가 NEW.area 를 읽도록 함수 재정의. (413의 게시 자유화 = 일일 한도 제거 유지)

CREATE OR REPLACE FUNCTION enforce_live_post_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_area TEXT;
  v_author_area TEXT;
BEGIN
  -- club_id 미지정 = 일반 SHOT — 규칙 없음
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- club_id 지정 LIVE: club.area(한글) 와 작성자 area(코드) 일치 강제
  SELECT area INTO v_club_area FROM clubs WHERE id = NEW.club_id;
  IF v_club_area IS NULL THEN
    RAISE EXCEPTION 'LIVE_INVALID_CLUB: 선택한 클럽을 찾을 수 없어요'
      USING ERRCODE = 'P0001';
  END IF;

  -- chat_shots의 작성자 인증 지역 컬럼은 area (author_area 아님)
  v_author_area := NEW.area;
  IF NOT (
    (v_club_area = '강남'   AND v_author_area = 'gangnam') OR
    (v_club_area = '홍대'   AND v_author_area = 'hongdae') OR
    (v_club_area = '이태원' AND v_author_area = 'itaewon')
  ) THEN
    RAISE EXCEPTION 'LIVE_AREA_MISMATCH: 인증된 지역과 클럽 지역이 달라요'
      USING ERRCODE = 'P0001';
  END IF;

  -- 게시 한도는 413에서 제거됨(스탬프 조건으로 이동). 여기선 area 일치만 강제.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_live_post_rules() IS
  'Migration 419: club_id 지정 시 club.area와 chat_shots.area(작성자 인증 지역) 일치 강제. author_area 오참조 수정.';
