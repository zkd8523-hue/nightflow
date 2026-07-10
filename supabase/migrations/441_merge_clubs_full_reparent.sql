-- ============================================================================
-- Migration 438: merge_clubs 버튼이 '모든' 자식 데이터를 이관하도록 보강
-- 날짜: 2026-07-09
-- 배경:
--   기존 merge_clubs(178)는 auctions / users.default_club_id / club_partners
--   3개만 target으로 옮기고 나머지 24개 자식 테이블(조각/깃발/즐겨찾기/한줄평/
--   워드클라우드/오퍼프리셋/게스트간판 등)은 source에 매달린 채 soft-delete →
--   데이터 고아화(손실). 관리자 '병합' 버튼을 쓰면 그 데이터가 사라짐.
-- 이 마이그레이션:
--   1) 재사용 헬퍼 2개(_mv_plain_merge / _mv_guarded_merge)를 '영구' 함수로 생성.
--      - 스키마 드리프트 방어: 테이블/컬럼 없으면 조용히 no-op(에러 안 냄).
--      - guarded = UNIQUE(club_id, 보조컬럼…) 보유 테이블: 충돌 안 나는 행만 옮기고
--        target에 이미 같은 키가 있는 source 행은 삭제(= 기존 club_partners 패턴).
--   2) merge_clubs를 같은 시그니처로 재정의: 27개 자식 테이블 전수 이관 +
--      클럽 자체 정보(썸네일/별칭) 손실 방지 보강 후 source soft-delete.
--   ⚠️ 컬럼명은 실제 스키마 기준(416의 slot_date/weekday/author 오타 버그를 교정):
--      weekly_hotdeal_slots=week_start, share_weekday_plan=dow, club_word_clouds=author_id
--   ⚠️ club_reviews/club_one_liners는 UNIQUE(club_id, user/author)라 반드시 guarded
--      (plain으로 옮기면 같은 유저가 양쪽 리뷰 시 23505).
-- 적용: Supabase 대시보드 SQL Editor에 통째로 1회 실행 (service_role). db push 금지.
-- keeper 선택은 관리자가 target을 직접 지정(버튼 UX). 이 함수는 이관만 완전하게.
-- ============================================================================

-- ── 헬퍼 1: 단순 이관 (UNIQUE 제약 없는 자식) ──────────────────────────────
CREATE OR REPLACE FUNCTION _mv_plain_merge(p_src UUID, p_tgt UUID, p_tbl TEXT, p_col TEXT)
RETURNS void AS $fn$
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=p_tbl AND column_name=p_col) THEN RETURN; END IF;
  EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = $2', p_tbl, p_col, p_col) USING p_tgt, p_src;
END $fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 헬퍼 2: 충돌회피 이관 (UNIQUE(club_id, 보조컬럼…) 보유 자식) ─────────────
--   보조컬럼이 여러 개면(복합 UNIQUE) 전부 일치할 때만 충돌로 간주.
CREATE OR REPLACE FUNCTION _mv_guarded_merge(p_src UUID, p_tgt UUID, p_tbl TEXT, p_cols TEXT[])
RETURNS void AS $fn$
DECLARE v_cond TEXT; v_col TEXT;
BEGIN
  IF to_regclass('public.'||p_tbl) IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=p_tbl AND column_name='club_id') THEN RETURN; END IF;
  FOREACH v_col IN ARRAY p_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=p_tbl AND column_name=v_col) THEN RETURN; END IF;
  END LOOP;
  SELECT string_agg(format('k.%I = t.%I', c, c), ' AND ') INTO v_cond FROM unnest(p_cols) AS c;
  -- 1) target에 같은 보조키가 없는 source 행만 target으로 이동
  EXECUTE format(
    'UPDATE %1$I t SET club_id = $1
       WHERE t.club_id = $2
         AND NOT EXISTS (SELECT 1 FROM %1$I k WHERE k.club_id = $1 AND %2$s)',
    p_tbl, v_cond) USING p_tgt, p_src;
  -- 2) 남은(충돌해 못 옮긴) source 행 삭제 = target에 이미 동일 데이터 존재
  EXECUTE format('DELETE FROM %I WHERE club_id = $1', p_tbl) USING p_src;
END $fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── merge_clubs 재정의 (시그니처/권한/반환 유지, 이관만 전수화) ──────────────
CREATE OR REPLACE FUNCTION merge_clubs(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_admin_role   TEXT;
  v_target_active BOOLEAN;
  v_source_active BOOLEAN;
  v_auction_count INT := 0;
  v_md_count      INT := 0;
  v_partner_count INT := 0;
BEGIN
  -- 권한/유효성 (기존과 동일)
  SELECT role INTO v_admin_role FROM users WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge club into itself';
  END IF;
  SELECT (deleted_at IS NULL) INTO v_target_active FROM clubs WHERE id = p_target_id;
  SELECT (deleted_at IS NULL) INTO v_source_active FROM clubs WHERE id = p_source_id;
  IF v_target_active IS NOT TRUE THEN RAISE EXCEPTION 'Target club not found or already deleted'; END IF;
  IF v_source_active IS NOT TRUE THEN RAISE EXCEPTION 'Source club not found or already deleted'; END IF;

  -- 반환용 카운트 (이동 전 집계)
  SELECT COUNT(*) INTO v_auction_count FROM auctions       WHERE club_id = p_source_id;
  SELECT COUNT(*) INTO v_md_count      FROM users          WHERE default_club_id = p_source_id;
  SELECT COUNT(*) INTO v_partner_count FROM club_partners  WHERE club_id = p_source_id;

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
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'payment_escrow',              'club_id');   -- 없으면 no-op
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'search_misses',               'resolved_alias_for');
  PERFORM _mv_plain_merge(p_source_id, p_target_id, 'users',                       'default_club_id');

  -- ── 충돌회피 이관 (UNIQUE(club_id, …) 보유) — 실제 컬럼명 기준 ──
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_partners',        ARRAY['md_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'user_favorite_clubs',  ARRAY['user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'user_pinned_clubs',    ARRAY['user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'weekly_share_slots',   ARRAY['week_start']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'weekly_hotdeal_slots', ARRAY['week_start']);        -- (slot_date 아님)
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'share_weekday_plan',   ARRAY['md_id','dow','option_id']); -- (weekday 아님, 복합)
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_word_clouds',     ARRAY['author_id']);          -- (author 아님)
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_word_cloud_likes',ARRAY['normalized_word','user_id']);
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_reviews',         ARRAY['user_id']);            -- UNIQUE → guarded 필수
  PERFORM _mv_guarded_merge(p_source_id, p_target_id, 'club_one_liners',      ARRAY['author_id']);          -- UNIQUE → guarded 필수

  -- ── 클럽 자체 정보 손실 방지: target에 없는 값 source에서 보강 + 별칭/이름 흡수 ──
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
  UPDATE clubs SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_source_id;

  RETURN json_build_object(
    'success', true,
    'merged_auctions', v_auction_count,
    'merged_mds', v_md_count,
    'merged_partners', v_partner_count,
    'full_reparent', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 적용 후 검증 (병합 1건 실행 뒤, source_id로 잔존 자식 0 확인):
--   SELECT 'auctions' t, COUNT(*) FROM auctions WHERE club_id='<source>'
--   UNION ALL SELECT 'partners', COUNT(*) FROM club_partners WHERE club_id='<source>'
--   UNION ALL SELECT 'favorites', COUNT(*) FROM user_favorite_clubs WHERE club_id='<source>'
--   UNION ALL SELECT 'share_slot', COUNT(*) FROM weekly_share_slots WHERE club_id='<source>'
--   UNION ALL SELECT 'oneliner', COUNT(*) FROM club_one_liners WHERE club_id='<source>';
--   → 전부 0 이어야 정상(전수 이관됨).
-- ============================================================================
