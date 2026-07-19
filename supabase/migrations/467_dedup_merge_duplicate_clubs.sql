-- ============================================================================
-- Migration 467: 중복 클럽 레코드 일괄 병합 (이름+지역 동일 → 하나로)
-- 날짜: 2026-07-19
-- 배경:
--   ClubForm 무검사 insert 재발로 같은 이름·지역의 클럽 레코드가 다수 존재
--   (CLUB BERMUDA 8개, OCEAN 5개, K-bat/도깨비/레이스&사운드/SOUND 3개 등).
--   → 클럽 목록·지도·클럽 선택창·LIVE 캐러셀에 같은 클럽이 여러 번 노출.
-- 정책:
--   keeper(target) = MD가 배정된(club_partners 보유) 레코드 우선
--                    → 없으면 approved & 가장 오래된 레코드.
--   나머지 source들을 keeper로 '전수 이관'(27개 자식 테이블) 후 soft-delete.
--   이관 로직은 Migration 441의 헬퍼(_mv_plain_merge/_mv_guarded_merge)를 재사용.
--   ※ merge_clubs()는 admin auth(auth.uid) 검사가 있어 SQL 에디터(service_role)에서
--     못 쓰므로, admin 검사 없는 임시 함수 _mv_merge_pair로 동일 이관을 수행 후 DROP.
-- 적용: Supabase 대시보드 SQL Editor에 통째로 1회 실행 (service_role). db push 금지.
--   ⚠️ 실행 전 헬퍼(_mv_plain_merge/_mv_guarded_merge)가 존재해야 함 = Migration 441 선적용.
-- ============================================================================

-- ── 임시 병합 함수 (merge_clubs 본문에서 admin 체크만 제거) ──────────────────
CREATE OR REPLACE FUNCTION _mv_merge_pair(p_source_id UUID, p_target_id UUID)
RETURNS void AS $$
BEGIN
  -- 유효성: 둘 다 살아있어야 함. 이미 처리됐거나 없으면 조용히 스킵.
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_target_id AND deleted_at IS NULL) THEN
    RAISE NOTICE 'skip: target % 없음/삭제됨', p_target_id; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_source_id AND deleted_at IS NULL) THEN
    RAISE NOTICE 'skip: source % 없음/삭제됨', p_source_id; RETURN;
  END IF;
  IF p_source_id = p_target_id THEN RETURN; END IF;

  -- ── 단순 이관 (UNIQUE 없는 자식) ──
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'auctions',                    'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'auction_templates',           'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'puzzle_offers',               'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'puzzles',                     'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'puzzle_reviews',              'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'share_options',               'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'daily_hotdeals',              'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'hotdeal_templates',           'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'hotdeal_slot_contact_clicks', 'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'md_offer_presets',            'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'one_liner_reports',           'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'club_info_reports',           'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'club_change_log',             'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'chat_shots',                  'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'payment_escrow',              'club_id');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'search_misses',               'resolved_alias_for');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'users',                       'default_club_id');

  -- ── 충돌회피 이관 (UNIQUE(club_id, …) 보유) ──
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_partners',         ARRAY['md_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'user_favorite_clubs',   ARRAY['user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'user_pinned_clubs',     ARRAY['user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'weekly_share_slots',    ARRAY['week_start']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'weekly_hotdeal_slots',  ARRAY['week_start']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'share_weekday_plan',    ARRAY['md_id','dow','option_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_word_clouds',      ARRAY['author_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_word_cloud_likes', ARRAY['normalized_word','user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_reviews',          ARRAY['user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_one_liners',       ARRAY['author_id']);

  -- ── 클럽 자체 정보 손실 방지: target에 없는 값 보강 + 별칭/이름 흡수 ──
  UPDATE clubs t SET
    thumbnail_url = COALESCE(t.thumbnail_url, s.thumbnail_url),
    aliases = ARRAY(
      SELECT DISTINCT x FROM unnest(
        COALESCE(t.aliases,'{}'::text[]) || COALESCE(s.aliases,'{}'::text[]) || ARRAY[s.name]
      ) AS x
      WHERE x IS NOT NULL AND x <> '' AND lower(trim(x)) <> lower(trim(t.name))
    )
  FROM clubs s
  WHERE t.id = p_target_id AND s.id = p_source_id;

  -- ── source soft-delete ──
  UPDATE clubs SET deleted_at = now() WHERE id = p_source_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 병합 실행 (source → keeper) ─────────────────────────────────────────────
DO $$
BEGIN
  PERFORM _mv_merge_pair('56622328-16dd-4cf0-aacd-bfc6df18c017', '5a2f73fd-2a63-46b8-b5d5-bf344cdfff22'); -- 12(홍대)
  PERFORM _mv_merge_pair('2629d0e4-49b8-4928-8169-23b493c6a34d', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('285ed0d2-983f-49da-8873-f3d00a165d88', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('769ab7a0-3c7c-4ce0-8bbb-dafa7d4e0562', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('2ebb568e-3138-4e32-a2ea-0f77c73270e6', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('eaa153a6-3a6e-42b4-9413-d2fc5b71698b', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('c3f1cb32-3342-48b6-a504-58a5b5a71cc8', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('bacc2c01-7b12-4e75-954d-87d3d85cc8d5', 'd912c171-7b9c-40a4-8c89-dc05caf35ebd'); -- CLUB BERMUDA(홍대)
  PERFORM _mv_merge_pair('38e77d23-babf-4ba5-b92d-a9970068f234', 'e2e6e10a-e574-472c-af49-6380a05032ee'); -- 레이스&사운드(강남)
  PERFORM _mv_merge_pair('19aec6df-d171-4e3f-9377-eac27a232d25', 'e2e6e10a-e574-472c-af49-6380a05032ee'); -- 레이스&사운드(강남)
  PERFORM _mv_merge_pair('51325bf2-8dff-44a6-8ac1-10c15b3b39ee', '0d24b754-6c1d-40f6-badd-b398d03a4b3f'); -- 그루브&스팟(부산)
  PERFORM _mv_merge_pair('5d93fcc8-3893-4597-9f15-1b5735f0431c', '5cf5658b-b1ba-4744-a1d0-ae4a60a67828'); -- 브리드(BREED)(대구)
  PERFORM _mv_merge_pair('78768e0e-839e-4325-9d58-740726a6c7cd', 'bd820f57-46b6-4d95-822a-4f0cf8e84542'); -- OCEAN(홍대)
  PERFORM _mv_merge_pair('61c8f958-43f9-4f85-978d-12a8a57c5c38', 'bd820f57-46b6-4d95-822a-4f0cf8e84542'); -- OCEAN(홍대)
  PERFORM _mv_merge_pair('1ffce343-ea6d-4dde-90a8-934646f49bd0', 'bd820f57-46b6-4d95-822a-4f0cf8e84542'); -- OCEAN(홍대)
  PERFORM _mv_merge_pair('a2033119-9416-43b5-877e-b76d866217f4', 'bd820f57-46b6-4d95-822a-4f0cf8e84542'); -- OCEAN(홍대)
  PERFORM _mv_merge_pair('0b350d81-3d3c-44f0-9113-32ce0861f87b', 'ce68b26b-c80f-430e-ae82-733265bceb89'); -- SOUND(강남)
  PERFORM _mv_merge_pair('466dcbff-28d2-4e71-b005-9254e21ab5b6', 'ce68b26b-c80f-430e-ae82-733265bceb89'); -- SOUND(강남)
  PERFORM _mv_merge_pair('14ed8351-1117-4210-b289-eec759bd9b07', 'e964ef09-bef3-4e0d-9bcf-8b3fafa50c9d'); -- DM 라운지(강남)
  PERFORM _mv_merge_pair('8f0e78f8-60c8-49a5-b865-47c4eabf97de', '35de296e-5fdc-435b-baf2-1c7c05538687'); -- Club Ace(강남)
  PERFORM _mv_merge_pair('4fbc1eb1-1a63-4594-b79a-4dc459c1de20', '93f1081a-250c-402a-a0d4-9b8a309aff57'); -- 도깨비(홍대)
  PERFORM _mv_merge_pair('4c8b8c51-b03f-4d50-98bf-e3c9b7ecfedf', 'ebbf5c8c-a3c2-4477-b144-89970f9e2835'); -- 클럽 에이스(강남)
  PERFORM _mv_merge_pair('4ced07b5-ab40-4143-9451-69d55065a00c', '47ab2030-a617-4684-9c0f-85aab8ad0af6'); -- 213(강남)
  PERFORM _mv_merge_pair('ef6158c1-87d8-49c8-9c63-1e1d89be7597', 'fa3c81f0-29ab-4756-8f87-8c681b5cde10'); -- K-bat 빠따(홍대)
  PERFORM _mv_merge_pair('d696db9c-a50a-4d90-8d57-b456559d0c4b', 'fa3c81f0-29ab-4756-8f87-8c681b5cde10'); -- K-bat 빠따(홍대)
  PERFORM _mv_merge_pair('96e675b0-9823-443d-a279-6f1577de5a55', 'f6b421c3-cff5-4dba-9f69-c656b6ca3cd2'); -- BERMUDA(홍대)
  PERFORM _mv_merge_pair('c809385b-2a97-47a9-942b-6dafc4344044', 'f6b421c3-cff5-4dba-9f69-c656b6ca3cd2'); -- BERMUDA(홍대)
  PERFORM _mv_merge_pair('351f96d5-dd0d-4edb-b259-5d0ec9c9a1b5', 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4'); -- Core Seoul(강남)
  PERFORM _mv_merge_pair('ef4efb33-d60e-43ab-917d-ccb2c802af25', 'dafb3e5c-919d-4cbc-9363-6e8797dcf631'); -- Dawn(이태원)
END $$;

-- ── 임시 함수 정리 (admin 체크 없는 병합 함수는 남기지 않음) ──
DROP FUNCTION IF EXISTS _mv_merge_pair(UUID, UUID);

-- ============================================================================
-- 적용 후 검증: 이름+지역 중복(살아있는 레코드 2+) 이 0 이어야 정상.
--   SELECT lower(trim(name)) n, area, count(*) c
--   FROM clubs WHERE deleted_at IS NULL AND is_test = false
--   GROUP BY 1,2 HAVING count(*) > 1 ORDER BY c DESC;
-- ============================================================================
