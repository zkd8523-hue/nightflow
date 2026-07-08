-- ============================================================================
-- Migration 417: admin이 깃발 오퍼별 "MD 답장 여부"를 확인하는 RPC
-- 날짜: 2026-07-08
-- 설명:
--   깃발 오퍼 상담 상태를 admin이 모니터링할 때, 지금은 leader_chat_started_at만
--   보고 전부 "상담중"으로 표시됨. 하지만 방장이 먼저 말을 걸어도 MD가 답을 안 한
--   상태(= MD 답장 기다리는중)와 MD가 답한 상태(= 대화중)를 구분해야 한다.
--
--   "MD 답장" 판정 기준은 Migration 406(notify_admin_md_noreply)과 동일:
--     puzzle_offer_messages에 sender_id = 해당 오퍼 md_id 인 행이 존재하면 답장함.
--
--   puzzle_offer_messages RLS는 참여자(md_id/leader_id) 전용이라 admin이 못 읽음
--   → SECURITY DEFINER RPC로 우회 조회, 반환은 해당 퍼즐 오퍼에 한정.
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_get_offer_md_replied(p_puzzle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자만 조회할 수 있어요');
  END IF;

  -- 오퍼별 상담 메타데이터 집계 (내용 없이 건수/시각/마지막 발신자만):
  --   leader/md = 각자 보낸 메시지 수, replied = MD가 1건이라도 보냈는지
  --   last_at = 마지막 메시지 시각, last_by = 마지막 발신자('leader'|'md')
  SELECT COALESCE(
    jsonb_object_agg(
      t.offer_id::text,
      jsonb_build_object(
        'leader', t.leader_cnt,
        'md', t.md_cnt,
        'replied', t.md_cnt > 0,
        'last_at', t.last_at,
        'last_by', CASE
          WHEN t.last_sender IS NULL THEN NULL
          WHEN t.last_sender = t.md_id THEN 'md'
          WHEN t.last_sender = t.leader_id THEN 'leader'
          ELSE 'other'
        END
      )
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      o.id AS offer_id,
      p.leader_id,
      o.md_id,
      count(*) FILTER (
        WHERE m.sender_id = p.leader_id AND m.is_deleted = false
      ) AS leader_cnt,
      count(*) FILTER (
        WHERE m.sender_id = o.md_id AND m.is_deleted = false
      ) AS md_cnt,
      max(m.created_at) FILTER (WHERE m.is_deleted = false) AS last_at,
      (
        SELECT lm.sender_id
        FROM puzzle_offer_messages lm
        WHERE lm.offer_id = o.id AND lm.is_deleted = false
        ORDER BY lm.created_at DESC
        LIMIT 1
      ) AS last_sender
    FROM puzzle_offers o
    JOIN puzzles p ON p.id = o.puzzle_id
    LEFT JOIN puzzle_offer_messages m ON m.offer_id = o.id
    WHERE o.puzzle_id = p_puzzle_id
      AND o.status IN ('pending', 'accepted')
    GROUP BY o.id, p.leader_id, o.md_id
  ) t;

  RETURN jsonb_build_object('success', true, 'replied', v_result);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_get_offer_md_replied(UUID) TO authenticated;
