-- ============================================================================
-- Migration 546: 지난 쿠폰 즐겨찾기(자주 쓰기)
-- 날짜: 2026-08-24
-- 선행: 539, 543 (delete_coupon_issue)
--
-- 배경:
--   "다시 발행"으로 지난 쿠폰을 재사용하는데, 발행이 쌓이면 자주 쓰는 세팅이
--   목록 아래로 밀려 매번 찾아야 한다. 별표로 고정해 맨 위에 두게 한다.
--
--   별도 템플릿 테이블을 만들지 않는 이유: 지난 발행분 자체가 이미 템플릿
--   역할을 한다(카페24·쿠팡이츠의 "복사"/"재발행" 패턴). 컬럼 하나면 충분하다.
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣어 1회 실행. db push 금지.
-- ============================================================================

ALTER TABLE coupon_issues
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN coupon_issues.is_favorite IS
  'MD가 자주 쓰는 세팅으로 고정한 발행분. 지난 쿠폰 목록에서 맨 위로. Migration 546';

-- 목록은 md_id로 이미 인덱스가 있으므로(idx_coupon_issues_md) 별도 인덱스는 두지 않는다.

-- ============================================================================
-- toggle_coupon_favorite — 별표 켜고 끄기
--   RLS에 coupon_issues UPDATE 정책이 없다(RPC 전용 설계). 그래서 클라이언트가
--   직접 update 하지 못하고 이 함수를 거친다.
-- ============================================================================
CREATE OR REPLACE FUNCTION toggle_coupon_favorite(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_issue coupon_issues%ROWTYPE;
  v_next BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요해요');
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_uid;

  SELECT * INTO v_issue FROM coupon_issues WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '쿠폰을 찾을 수 없어요');
  END IF;
  IF v_issue.md_id <> v_uid AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', '본인 쿠폰만 설정할 수 있어요');
  END IF;

  v_next := NOT COALESCE(v_issue.is_favorite, FALSE);

  UPDATE coupon_issues SET is_favorite = v_next WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'is_favorite', v_next);
END;
$$;

COMMENT ON FUNCTION toggle_coupon_favorite(UUID) IS
  '지난 쿠폰 자주 쓰기 토글 (본인/admin). 목록 상단 고정용';
