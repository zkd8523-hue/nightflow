-- Migration 293: 기존 답글들의 reply_count 재집계
-- - 291 트리거가 적용되기 전에 작성된 답글들은 부모 reply_count에 반영되지 않음
-- - 모든 부모 메시지에 대해 실제 답글 수로 재집계

UPDATE chat_messages parent
SET reply_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT parent_id, COUNT(*) AS cnt
  FROM chat_messages
  WHERE parent_id IS NOT NULL
    AND is_deleted = FALSE
  GROUP BY parent_id
) sub
WHERE parent.id = sub.parent_id
  AND parent.reply_count IS DISTINCT FROM sub.cnt;
