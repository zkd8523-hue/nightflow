-- Migration 488: 5자 리뷰(워드클라우드) 단어 신고 + admin 즉시 푸시
--
-- 배경: 487에서 admin이 부적절한 단어를 지울 수 있게 했지만, 관리자가 직접
--       클럽 상세를 봐야만 발견 가능했다. 일반 유저/MD가 신고하면 admin에게
--       바로 푸시가 가도록 한다.
--
-- 신고 단위: 클럽 × 정규화 단어 (좋아요/admin 삭제와 동일한 키).
--   - 로그인 유저면 role 무관(user/md 모두) 신고 가능
--   - 본인이 남긴 단어는 신고 불가(직접 지우면 됨)
--   - 같은 단어 중복 신고 불가 (UNIQUE)
--
-- ⚠️ 이 파일은 여러 번 실행해도 안전 (IF NOT EXISTS / DROP IF EXISTS).

CREATE TABLE IF NOT EXISTS club_word_cloud_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  /** normalizeWord() 결과 = 집계/삭제 키 */
  normalized_word TEXT NOT NULL,
  /** 신고 당시 화면에 보이던 원본 표기 (관리자 확인용) */
  word_label TEXT,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (reason IN ('abuse', 'false_info', 'privacy', 'advertising', 'spam', 'other')),
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  admin_note TEXT,
  action_taken TEXT
    CHECK (action_taken IS NULL OR action_taken IN ('deleted', 'kept')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, normalized_word, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_word_reports_pending
  ON club_word_cloud_reports(status, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_word_reports_club
  ON club_word_cloud_reports(club_id, normalized_word);

ALTER TABLE club_word_cloud_reports ENABLE ROW LEVEL SECURITY;

-- 신고: 로그인 유저 누구나(user/md 포함), 본인 명의로만, 본인이 쓴 단어는 제외
DROP POLICY IF EXISTS "Login users can report word" ON club_word_cloud_reports;
CREATE POLICY "Login users can report word"
  ON club_word_cloud_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM club_word_clouds c
      WHERE c.club_id = club_word_cloud_reports.club_id
        AND c.author_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM unnest(c.words) AS w
          WHERE btrim(regexp_replace(lower(w), '\s+', ' ', 'g'))
                = club_word_cloud_reports.normalized_word
        )
    )
  );

-- 조회: 본인 신고 + admin
DROP POLICY IF EXISTS "View own word reports + admin" ON club_word_cloud_reports;
CREATE POLICY "View own word reports + admin"
  ON club_word_cloud_reports
  FOR SELECT
  USING (reporter_id = auth.uid() OR public.is_admin());

-- 처리: admin만
DROP POLICY IF EXISTS "Admin can update word reports" ON club_word_cloud_reports;
CREATE POLICY "Admin can update word reports"
  ON club_word_cloud_reports
  FOR UPDATE
  USING (public.is_admin());

COMMENT ON TABLE club_word_cloud_reports IS
  '5자 리뷰 워드클라우드 단어 신고 (클럽×정규화단어×신고자 1회). 본인 단어 신고 불가, admin 검토';

-- ============================================
-- 신고 INSERT → admin 딥링크 푸시 (480 헬퍼 사용)
-- ============================================
CREATE OR REPLACE FUNCTION notify_admin_word_cloud_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_name TEXT;
  v_reporter  TEXT;
  v_reason    TEXT;
  v_count     INTEGER;
BEGIN
  SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), '유저')
    INTO v_reporter FROM users WHERE id = NEW.reporter_id;

  v_reason := CASE NEW.reason
    WHEN 'abuse'       THEN '욕설·혐오'
    WHEN 'false_info'  THEN '허위사실'
    WHEN 'privacy'     THEN '개인정보·명예훼손'
    WHEN 'advertising' THEN '광고'
    WHEN 'spam'        THEN '스팸'
    ELSE '기타'
  END;

  -- 같은 단어 누적 미처리 신고 수 (도배/집중 신고 감지)
  SELECT COUNT(*) INTO v_count
  FROM club_word_cloud_reports
  WHERE club_id = NEW.club_id
    AND normalized_word = NEW.normalized_word
    AND status = 'pending';

  PERFORM notify_admins_push_url(
    '🚩 5자 리뷰 신고',
    COALESCE(v_club_name, '클럽') || ' · "'
      || COALESCE(NULLIF(NEW.word_label, ''), NEW.normalized_word) || '" · '
      || v_reason
      || CASE WHEN v_count > 1 THEN ' (누적 ' || v_count || '건)' ELSE '' END
      || ' · ' || v_reporter,
    '/admin/reviews',
    jsonb_build_object(
      'type', 'word_cloud_report',
      'report_id', NEW.id::TEXT,
      'club_id', NEW.club_id::TEXT,
      'word', NEW.normalized_word
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_word_cloud_report ON club_word_cloud_reports;
CREATE TRIGGER trg_notify_admin_word_cloud_report
  AFTER INSERT ON club_word_cloud_reports
  FOR EACH ROW EXECUTE FUNCTION notify_admin_word_cloud_report();
