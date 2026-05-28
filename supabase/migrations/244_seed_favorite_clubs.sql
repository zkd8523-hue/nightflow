-- ============================================================================
-- Migration 244: 클럽 좋아요 초기 시드
-- 날짜: 2026-05-26
-- 설명:
--   런칭 초기, 신규 유저에게 "이미 인기 있는 플랫폼" 인상을 주기 위해
--   각 클럽에 랜덤 좋아요(찜) 데이터를 시드한다.
--   - 클럽당 8~42개의 좋아요 (랜덤)
--   - 모든 좋아요는 비활성 시드 유저(seed_favorite_*) 로부터 발생
--   - ON CONFLICT DO NOTHING으로 재실행 안전
--   - 시드 유저는 role='user'이며 로그인/노출 불가 (auth.users에 없음)
-- ============================================================================

-- 1) 시드 유저 풀 생성 (50명, role=user). auth.users 외부에 존재.
--    users 테이블의 id가 auth.users(id)를 참조하지 않는다면 그대로 동작.
--    참조 제약이 있다면 아래 INSERT는 실패하므로, 그 경우 안전을 위해 SKIP.
DO $$
DECLARE
  v_constraint_exists BOOLEAN;
  v_existing_seed_count INT;
  v_i INT;
  v_uid UUID;
BEGIN
  -- users.id가 auth.users(id)를 FK로 참조하는지 확인
  SELECT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'users'
      AND kcu.column_name = 'id'
      AND rc.unique_constraint_schema = 'auth'
  ) INTO v_constraint_exists;

  IF v_constraint_exists THEN
    RAISE NOTICE 'users.id → auth.users FK 존재. 시드는 RPC로 별도 처리 필요. SKIP.';
    RETURN;
  END IF;

  -- 이미 시드한 유저가 있으면 SKIP (재실행 안전)
  SELECT COUNT(*) INTO v_existing_seed_count
  FROM users WHERE name LIKE 'seed_favorite_%';

  IF v_existing_seed_count >= 50 THEN
    RAISE NOTICE '시드 유저 % 명 이미 존재. SKIP.', v_existing_seed_count;
  ELSE
    FOR v_i IN (v_existing_seed_count + 1)..50 LOOP
      v_uid := gen_random_uuid();
      INSERT INTO users (id, name, display_name, role)
      VALUES (
        v_uid,
        'seed_favorite_' || lpad(v_i::TEXT, 3, '0'),
        'seed_favorite_' || lpad(v_i::TEXT, 3, '0'),
        'user'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- 2) 각 클럽에 랜덤 좋아요 시드 (이미 좋아요가 있으면 추가하지 않음)
DO $$
DECLARE
  v_club RECORD;
  v_target_count INT;
  v_current_count INT;
  v_to_add INT;
  v_seed_users UUID[];
  v_chosen UUID;
  v_idx INT;
BEGIN
  -- 시드 유저 풀 조회
  SELECT array_agg(id) INTO v_seed_users
  FROM users WHERE name LIKE 'seed_favorite_%';

  IF v_seed_users IS NULL OR array_length(v_seed_users, 1) = 0 THEN
    RAISE NOTICE '시드 유저가 없어 좋아요 시드를 SKIP합니다.';
    RETURN;
  END IF;

  FOR v_club IN
    SELECT id, name FROM clubs
    WHERE deleted_at IS NULL
      AND name NOT ILIKE '%운영자%'
  LOOP
    -- 클럽당 목표 좋아요: 8~42 사이 랜덤
    v_target_count := 8 + floor(random() * 35)::INT;

    SELECT COUNT(*) INTO v_current_count
    FROM user_favorite_clubs
    WHERE club_id = v_club.id;

    v_to_add := GREATEST(0, v_target_count - v_current_count);

    -- 부족분만큼 시드 유저에서 랜덤 추출하여 INSERT (UNIQUE 제약으로 중복 회피)
    FOR v_idx IN 1..v_to_add LOOP
      v_chosen := v_seed_users[1 + floor(random() * array_length(v_seed_users, 1))::INT];
      INSERT INTO user_favorite_clubs (user_id, club_id)
      VALUES (v_chosen, v_club.id)
      ON CONFLICT (user_id, club_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
