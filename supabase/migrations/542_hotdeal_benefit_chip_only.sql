-- ============================================================================
-- Migration 542: 게스트 간판 혜택 — 칩만 골라도 저장되게
-- 날짜: 2026-08-24
-- 배경:
--   혜택 입력은 자유 텍스트(text)와 혜택 칩(benefits[]) 두 가지다. 그런데
--   update_hotdeal_benefit가 text가 비면 곧바로 '빈 텍스트는 저장할 수 없어요'로
--   거절했다. 화면에서는 "무료입장" 칩만 눌러도 등록이 될 것처럼 보이지만
--   실제로는 저장이 안 되고, MD 입장에서는 칩을 왜 만들어 뒀는지 알 수 없다.
--
--   칩은 그 자체로 완결된 혜택이다("무료입장"이면 그것으로 충분하다). 텍스트는
--   부연 설명일 뿐이므로 필수일 이유가 없다.
--
--   → 둘 중 하나라도 있으면 저장한다. 둘 다 비면 그때만 거절한다.
--     (text는 NULL을 허용하되, 소비하는 쪽이 COALESCE로 읽도록 빈 문자열 대신
--      NULL을 그대로 넣어 기존 구조를 바꾸지 않는다.)
--
--   463 본문을 그대로 유지하고 검증 한 줄만 교체한다.
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

    -- benefits 정리: 빈 문자열 제외, trim, 최대 5개
    -- (Migration 542: 빈 텍스트 검증보다 먼저 정리해야 "칩만 있는 슬롯"을 판별할 수 있다)
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

    -- Migration 542: 텍스트와 칩 중 하나라도 있으면 통과. 둘 다 비었을 때만 거절.
    IF v_text IS NULL AND jsonb_array_length(v_clean_benefits) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', '혜택을 입력하거나 골라주세요');
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

    v_clean := v_clean || jsonb_build_object(
      'from', v_from,
      'until', v_until,
      'text', COALESCE(v_text, ''),
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
  '요일별 시간대 슬롯 배열 갱신. 각 슬롯은 {from?,until,text,benefits[]} 구조.
   텍스트와 혜택 칩 중 하나만 있어도 저장된다(Migration 542).';
