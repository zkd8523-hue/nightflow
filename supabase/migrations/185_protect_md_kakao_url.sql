-- ============================================================
-- Migration 185: MD 카카오 오픈채팅 URL 삭제 가드
-- ============================================================
-- 배경: MD가 share 매물 등록 후 마이프로필에서 kakao_open_chat_url을
-- 지우면 기존 참여자들이 채팅방에 재진입 불가 (NULL).
-- 진행 중인 share 매물이 있는 경우 URL 비우기 차단.
-- ============================================================

CREATE OR REPLACE FUNCTION protect_md_kakao_url()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_active_share_count INTEGER;
BEGIN
  -- URL이 NULL/빈문자로 바뀌는 경우만 검사
  IF (NEW.kakao_open_chat_url IS NULL OR NEW.kakao_open_chat_url = '')
     AND OLD.kakao_open_chat_url IS NOT NULL
     AND OLD.kakao_open_chat_url <> '' THEN

    SELECT COUNT(*) INTO v_active_share_count
    FROM auctions
    WHERE md_id = NEW.id
      AND listing_type = 'share'
      AND status IN ('scheduled', 'active', 'won');

    IF v_active_share_count > 0 THEN
      RAISE EXCEPTION 'CANNOT_CLEAR_KAKAO_URL_WITH_ACTIVE_SHARES'
        USING ERRCODE = 'P0001',
              MESSAGE = format('진행 중인 조각 매물이 %s건 있습니다. 매물을 먼저 종료/취소한 후 URL을 비울 수 있습니다.', v_active_share_count);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_md_kakao_url ON users;
CREATE TRIGGER trg_protect_md_kakao_url
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_md_kakao_url();
