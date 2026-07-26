-- ============================================================================
-- Migration 484: 채팅 안읽음 "개수" (카톡식 N 뱃지)
-- 날짜: 2026-07-26
-- 배경:
--   1) 조각 단체방을 읽어도 목록의 빨간 점이 안 사라짐.
--      → 클라이언트가 mark_party_read RPC를 await 하지 않아(supabase-js 빌더는
--        lazy thenable) HTTP 요청 자체가 안 나갔음. 클라이언트에서 수정.
--      → 실제 DB의 puzzle_party_reads에는 "내가 메시지를 보낸 시각"만 기록돼 있었음.
--   2) 안읽음이 boolean(점)이라 몇 개인지 알 수 없음 → 카톡처럼 숫자 노출.
-- 내용 (ADDITIVE, 기존 unread 필드 유지 + unread_count 추가):
--   - get_party_chats():  unread_count 추가 (본문은 430 최신본 그대로)
--   - get_offer_chats():  unread_count 추가 (본문은 361 최신본 그대로)
--   - mark_dm_read():     1:1 DM 읽음 처리 (dm_messages.read_at) 신규
-- 주의:
--   프로덕션 get_party_chats가 349/360 세대로 보임(목록에 target_count·
--   club_thumbnail 없음, cancelled 조각 노출). 이 마이그레이션이 최신 본문으로
--   덮어쓰므로 410/411/412/430도 함께 반영된다.
-- 실행: Supabase 대시보드 SQL Editor 1회. db push 금지.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) get_party_chats(): 조각 단체방 목록 + 안읽음 개수
--    (Migration 430 본문 + unread_count)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_party_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      p.id                AS puzzle_id,
      p.area              AS area,
      p.notes             AS notes,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.current_count     AS member_count,
      p.target_count      AS target_count,
      c.thumbnail_url     AS club_thumbnail,
      (p.leader_id = auth.uid()) AS is_leader,
      p.status            AS puzzle_status,
      COALESCE(lm.content, '단체채팅이 열렸어요') AS last_content,
      COALESCE(lm.created_at, p.created_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      ur.cnt              AS unread_count,
      (ur.cnt > 0)        AS unread
    FROM puzzles p
    LEFT JOIN clubs c ON c.id = p.club_id
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_party_messages
      WHERE puzzle_id = p.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS cnt
      FROM puzzle_party_messages m2
      WHERE m2.puzzle_id = p.id
        AND m2.is_deleted = false
        AND m2.is_system = false                     -- 시스템 메시지 제외(360)
        AND m2.sender_id IS DISTINCT FROM auth.uid()
        AND m2.created_at > COALESCE(
          (SELECT r.last_read_at FROM puzzle_party_reads r
            WHERE r.puzzle_id = p.id AND r.user_id = auth.uid()),
          'epoch'::timestamptz)
    ) ur ON true
    WHERE p.is_recruiting_party = true
      AND p.status <> 'cancelled'
      -- expired는 완전 제외하지 않고, 이벤트 당일~2일 이내(KST)까지 채팅 유지
      AND (
        p.status <> 'expired'
        OR p.event_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 2)
      )
      AND is_party_participant(p.id, auth.uid())
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_party_chats() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) get_offer_chats(): 깃발 1:1 오퍼 채팅 목록 + 안읽음 개수
--    (Migration 361 본문 + unread_count)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_offer_chats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.last_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      o.id                AS offer_id,
      o.puzzle_id         AS puzzle_id,
      o.status            AS offer_status,
      p.area              AS area,
      p.event_date        AS event_date,
      COALESCE(p.total_budget, p.budget_per_person * p.target_count) AS budget,
      p.is_recruiting_party AS is_recruiting_party,
      CASE WHEN p.leader_id = auth.uid() THEN 'leader' ELSE 'md' END AS my_role,
      cp.id               AS counterpart_id,
      cp.display_name     AS counterpart_name,
      cp.profile_image    AS counterpart_image,
      COALESCE(lm.content, '매칭됐어요 · 대화를 시작해보세요') AS last_content,
      COALESCE(lm.created_at, o.updated_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      ur.cnt              AS unread_count,
      (ur.cnt > 0)        AS unread
    FROM puzzle_offers o
    JOIN puzzles p ON p.id = o.puzzle_id
    JOIN public_user_profiles cp
      ON cp.id = CASE WHEN p.leader_id = auth.uid() THEN o.md_id ELSE p.leader_id END
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM puzzle_offer_messages
      WHERE offer_id = o.id AND is_deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS cnt
      FROM puzzle_offer_messages m2
      WHERE m2.offer_id = o.id
        AND m2.is_deleted = false
        AND m2.sender_id <> auth.uid()
        AND m2.created_at > COALESCE(
              CASE WHEN p.leader_id = auth.uid() THEN o.leader_read_at ELSE o.md_read_at END,
              'epoch'::timestamptz)
    ) ur ON true
    WHERE (p.leader_id = auth.uid() OR o.md_id = auth.uid())
      AND p.is_recruiting_party = false   -- 조각은 단체채팅으로 통합 → 1:1 목록 제외
      AND NOT (
        (p.leader_id = auth.uid() AND o.leader_chat_hidden_at IS NOT NULL)
        OR (o.md_id = auth.uid() AND o.md_chat_hidden_at IS NOT NULL)
      )
      AND (
        o.status = 'accepted'
        OR EXISTS (
          SELECT 1 FROM puzzle_offer_messages m
          WHERE m.offer_id = o.id AND m.is_deleted = false
        )
      )
  ) t;
$$;
GRANT EXECUTE ON FUNCTION get_offer_chats() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) mark_dm_read(): 1:1 DM 읽음 처리
--    dm_messages.read_at 컬럼은 465에 있었지만 아무도 채우지 않아 항상 NULL이었음.
--    RLS UPDATE 정책은 "본인이 보낸 메시지"만 허용 → 상대 메시지 읽음은 DEFINER로.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_dm_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM dm_threads t
    WHERE t.id = p_thread_id AND auth.uid() IN (t.requester_id, t.recipient_id)
  ) THEN
    RETURN;
  END IF;

  UPDATE dm_messages
     SET read_at = now()
   WHERE thread_id = p_thread_id
     AND sender_id <> auth.uid()
     AND read_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_dm_read(UUID) TO authenticated;

-- DM 안읽음 개수 조회용 인덱스 (thread_id + read_at NULL 스캔)
CREATE INDEX IF NOT EXISTS idx_dm_messages_unread
  ON dm_messages (thread_id, read_at)
  WHERE read_at IS NULL AND is_deleted = false;

COMMENT ON FUNCTION mark_dm_read(UUID) IS
  'DM 방 진입/새 메시지 시 상대 메시지 읽음 처리 (나의 채팅 메시지 탭 N 뱃지).';
