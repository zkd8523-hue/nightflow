-- 핫딜 요일별 혜택 시간대 슬롯 도입
-- benefits_by_dow[dow]: string → HotdealTimeSlot[] = [{until: "HH:00"|null, text: string}]
-- 기존 string 데이터는 클라이언트에서 normalize (DB 변환 없음)

DROP FUNCTION IF EXISTS update_hotdeal_benefit(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION update_hotdeal_benefit(
  p_slot_id UUID,
  p_dow TEXT,
  p_slots JSONB   -- HotdealTimeSlot[] 또는 NULL/빈배열이면 해당 요일 키 제거
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_md_id UUID := auth.uid();
  v_owner UUID;
  v_clean JSONB;
  v_item JSONB;
  v_text TEXT;
  v_until TEXT;
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
  IF v_owner <> v_md_id THEN
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
    IF v_text IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '빈 텍스트는 저장할 수 없어요');
    END IF;
    IF v_until IS NOT NULL AND v_until !~ '^[0-2][0-9]:00$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'until은 HH:00 형식');
    END IF;
    v_clean := v_clean || jsonb_build_object('until', v_until, 'text', v_text);
  END LOOP;

  UPDATE weekly_hotdeal_slots
    SET benefits_by_dow = benefits_by_dow || jsonb_build_object(p_dow, v_clean)
    WHERE id = p_slot_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION update_hotdeal_benefit(UUID, TEXT, JSONB) IS
  '요일별 시간대 슬롯 배열 갱신 (NULL/빈배열이면 해당 요일 키 제거, 최대 3개)';
