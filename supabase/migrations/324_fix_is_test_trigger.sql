-- Migration 324: is_test 트리거 버그 수정
-- 문제: BEFORE INSERT 트리거의 SELECT INTO가 users row 없거나 0 row 반환 시
--       NEW.is_test가 NULL로 유지 → NOT NULL 제약 위반
-- 수정: 명시적 COALESCE로 항상 FALSE/TRUE 박기

CREATE OR REPLACE FUNCTION mark_chat_message_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.is_test := COALESCE(
    (SELECT is_test FROM users WHERE id = NEW.author_id),
    FALSE
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mark_chat_shot_is_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.is_test := COALESCE(
    (SELECT is_test FROM users WHERE id = NEW.author_id),
    FALSE
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mark_chat_message_is_test() IS
  'Migration 324: SELECT INTO 0 row 시 NULL 박히는 버그 수정. COALESCE로 FALSE 강제.';
