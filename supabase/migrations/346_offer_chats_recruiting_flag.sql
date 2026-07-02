-- ============================================================================
-- Migration 346: get_offer_chats()에 is_recruiting_party 추가
-- 날짜: 2026-07-01
-- 설명: 나의 채팅 목록에서 깃발/조각을 분리 표시하기 위해 각 채팅의
--       is_recruiting_party 플래그를 반환한다. (332 본문 복제 + 1필드 추가)
-- ============================================================================
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
      p.is_recruiting_party AS is_recruiting_party,  -- Migration 346: 깃발/조각 분리용
      CASE WHEN p.leader_id = auth.uid() THEN 'leader' ELSE 'md' END AS my_role,
      cp.id               AS counterpart_id,
      cp.display_name     AS counterpart_name,
      cp.profile_image    AS counterpart_image,
      COALESCE(lm.content, '매칭됐어요 · 대화를 시작해보세요') AS last_content,
      COALESCE(lm.created_at, o.updated_at) AS last_at,
      lm.sender_id        AS last_sender_id,
      EXISTS (
        SELECT 1 FROM puzzle_offer_messages m2
        WHERE m2.offer_id = o.id
          AND m2.is_deleted = false
          AND m2.sender_id <> auth.uid()
          AND m2.created_at > COALESCE(
                CASE WHEN p.leader_id = auth.uid() THEN o.leader_read_at ELSE o.md_read_at END,
                'epoch'::timestamptz)
      ) AS unread
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
    WHERE (p.leader_id = auth.uid() OR o.md_id = auth.uid())
      -- 내가 숨긴(삭제한) 대화는 제외 (참여자별)
      AND NOT (
        (p.leader_id = auth.uid() AND o.leader_chat_hidden_at IS NOT NULL)
        OR (o.md_id = auth.uid() AND o.md_chat_hidden_at IS NOT NULL)
      )
      AND (
        -- 메시지가 있거나(대화중), 수락되어 매치된 오퍼(메시지 0이어도 방 생성)
        o.status = 'accepted'
        OR EXISTS (
          SELECT 1 FROM puzzle_offer_messages m
          WHERE m.offer_id = o.id AND m.is_deleted = false
        )
      )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_offer_chats() TO authenticated;
