-- ============================================================================
-- Migration 463: 게스트 간판 시간대 슬롯에 "시작시각(from)" 추가
-- 날짜: 2026-07-14
-- 배경:
--   기존 HotdealTimeSlot은 {until(마감), text, benefits}만 저장했다.
--   MD가 "22:00부터 무료입장"처럼 시작 시각을 예고하고 싶어도 표현할 수 없었다.
--   → 각 슬롯에 선택적 from("HH:00") 추가.
--     소비측(summarizeSlots)은 시작 전이면 "22:00부터 …"로 예고하고,
--     시작시각이 지나면 문구에서 자동으로 뗀다(혜택 자체는 계속 노출).
--
-- 변경:
--   update_hotdeal_benefit가 슬롯을 {until,text,benefits}로만 재조립하며 from을
--   버리고 있었다(268 버전). from을 읽어 검증 후 보존하도록 재정의한다.
--   - from 형식: "HH:00" (until과 동일)
--   - from/until 둘 다 있으면 시작 < 마감 (새벽 0~5시는 익일로 취급)
--   - from 미지정(NULL) 시 기존 동작과 100% 동일 (하위호환)
--
-- 참조: 268_hotdeal_slot_benefits.sql (직전 버전)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_hotdeal_benefit(
  p_slot_id UUID,
  p_dow TEXT,
  p_slots JSONB   -- [{from?: "HH:00", until: "HH:00"|null, text: string, benefits?: string[]}] 또는 NULL/빈배열
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
  v_role TEXT;
  v_clean JSONB;
  v_item JSONB;
  v_text TEXT;
  v_until TEXT;
  v_from TEXT;
  v_benefits JSONB;
  v_b JSONB;
  v_clean_benefits JSONB;
  v_count INT;
BEGIN
  IF v_md_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  IF p_dow NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_dow는 mon~sun 중 하나');
  END IF;

  SELECT md_id INTO v_owner FROM weekly_hotdeal_slots WHERE id = p_slot_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '슬롯을 찾을 수 없어요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_md_id;
  IF v_owner <> v_md_id AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 슬롯만 수정할 수 있어요');
  END IF;

  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
    UPDATE weekly_hotdeal_slots
      SET benefits_by_dow = benefits_by_dow - p_dow
      WHERE id = p_slot_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  v_count := jsonb_array_length(p_slots);
  IF v_count > 3 THEN
    RETURN jsonb_build_object('success', false, 'error', '시간대 슬롯은 최대 3개');
  END IF;

  v_clean := '[]'::JSONB;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_text := NULLIF(TRIM(COALESCE(v_item->>'text', '')), '');
    v_until := v_item->>'until';
    v_from := v_item->>'from';
    v_benefits := v_item->'benefits';

    IF v_text IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '빈 텍스트는 저장할 수 없어요');
    END IF;
    IF v_until IS NOT NULL AND v_until !~ '^[0-2][0-9]:00$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'until은 HH:00 형식');
    END IF;
    IF v_from IS NOT NULL AND v_from !~ '^[0-2][0-9]:00$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'from은 HH:00 형식');
    END IF;
    -- 시작 < 마감 (새벽 0~5시는 익일 취급해 뒤로 정렬)
    IF v_from IS NOT NULL AND v_until IS NOT NULL
       AND (CASE WHEN LEFT(v_from, 2)::INT < 6 THEN LEFT(v_from, 2)::INT + 24 ELSE LEFT(v_from, 2)::INT END)
         >= (CASE WHEN LEFT(v_until, 2)::INT < 6 THEN LEFT(v_until, 2)::INT + 24 ELSE LEFT(v_until, 2)::INT END)
    THEN
      RETURN jsonb_build_object('success', false, 'error', '시작시각은 마감시각보다 빨라야 해요');
    END IF;

    -- benefits 정리: 빈 문자열 제외, trim, 최대 5개
    v_clean_benefits := '[]'::JSONB;
    IF v_benefits IS NOT NULL AND jsonb_typeof(v_benefits) = 'array' THEN
      IF jsonb_array_length(v_benefits) > 5 THEN
        RETURN jsonb_build_object('success', false, 'error', '혜택 태그는 최대 5개');
      END IF;
      FOR v_b IN SELECT * FROM jsonb_array_elements(v_benefits) LOOP
        IF jsonb_typeof(v_b) = 'string' THEN
          IF NULLIF(TRIM(v_b#>>'{}'), '') IS NOT NULL THEN
            v_clean_benefits := v_clean_benefits || to_jsonb(TRIM(v_b#>>'{}'));
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_clean := v_clean || jsonb_build_object(
      'from', v_from,
      'until', v_until,
      'text', v_text,
      'benefits', v_clean_benefits
    );
  END LOOP;

  UPDATE weekly_hotdeal_slots
    SET benefits_by_dow = benefits_by_dow || jsonb_build_object(p_dow, v_clean)
    WHERE id = p_slot_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_hotdeal_benefit(UUID, TEXT, JSONB) IS
  '요일별 시간대 슬롯 배열 갱신. 각 슬롯은 {from?,until,text,benefits[]} 구조. from은 시작시각 예고용.';
