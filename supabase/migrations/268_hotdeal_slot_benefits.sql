-- ============================================================================
-- Migration 264: HotdealTimeSlot에 benefits 배열 추가
--
--   각 시간대 슬롯이 { until, text, benefits: string[] } 구조.
--   benefits 예: ["free_entry", "free_drink", "직접입력 텍스트"]
--   클라이언트에서 라벨 매핑. DB는 string 배열만 보관.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_hotdeal_benefit(
  p_slot_id UUID,
  p_dow TEXT,
  p_slots JSONB   -- [{until: "HH:00"|null, text: string, benefits?: string[]}] 또는 NULL/빈배열
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
    v_benefits := v_item->'benefits';

    IF v_text IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '빈 텍스트는 저장할 수 없어요');
    END IF;
    IF v_until IS NOT NULL AND v_until !~ '^[0-2][0-9]:00$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'until은 HH:00 형식');
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
  '요일별 시간대 슬롯 배열 갱신. 각 슬롯은 {until,text,benefits[]} 구조.';
