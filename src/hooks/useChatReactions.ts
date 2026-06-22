"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_REACTION_EMOJIS,
  type ChatReactionEmoji,
  type ChatReactionRow,
  type ChatReactionSummary,
} from "@/types/database";

function emptyCounts(): Record<ChatReactionEmoji, number> {
  return CHAT_REACTION_EMOJIS.reduce(
    (acc, e) => {
      acc[e] = 0;
      return acc;
    },
    {} as Record<ChatReactionEmoji, number>
  );
}

/**
 * 여러 메시지의 이모지 반응 집계 + 토글 액션 제공
 */
export function useChatReactions(messageIds: string[], currentUserId?: string) {
  const [summaries, setSummaries] = useState<
    Map<string, ChatReactionSummary>
  >(new Map());

  // messageIds 배열 참조 안정화: 같은 내용이면 같은 키
  const messageIdsKey = useMemo(
    () => messageIds.slice().sort().join(","),
    [messageIds]
  );

  const fetchAll = useCallback(async () => {
    const ids = messageIdsKey ? messageIdsKey.split(",") : [];
    if (ids.length === 0) {
      setSummaries((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    if (error) {
      console.error("[useChatReactions] fetch error", error);
      return;
    }
    const map = new Map<string, ChatReactionSummary>();
    for (const id of ids) {
      map.set(id, { counts: emptyCounts(), mine: new Set() });
    }
    for (const r of (data ?? []) as ChatReactionRow[]) {
      const s = map.get(r.message_id);
      if (!s) continue;
      if (CHAT_REACTION_EMOJIS.includes(r.emoji)) {
        s.counts[r.emoji] += 1;
        if (currentUserId && r.user_id === currentUserId) {
          s.mine.add(r.emoji);
        }
      }
    }
    setSummaries(map);
  }, [messageIdsKey, currentUserId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** 옵티미스틱 토글 + DB 반영 */
  const toggle = useCallback(
    async (messageId: string, emoji: ChatReactionEmoji) => {
      if (!currentUserId) return;
      const supabase = createClient();

      // 옵티미스틱 + wasMine 판단을 setState updater 안에서 한 번에
      let wasMine = false;
      setSummaries((prev) => {
        const next = new Map(prev);
        const s = next.get(messageId) ?? {
          counts: emptyCounts(),
          mine: new Set<ChatReactionEmoji>(),
        };
        wasMine = s.mine.has(emoji);
        const newMine = new Set(s.mine);
        const newCounts = { ...s.counts };
        if (wasMine) {
          newMine.delete(emoji);
          newCounts[emoji] = Math.max(0, newCounts[emoji] - 1);
        } else {
          newMine.add(emoji);
          newCounts[emoji] = newCounts[emoji] + 1;
        }
        next.set(messageId, { counts: newCounts, mine: newMine });
        return next;
      });

      try {
        if (wasMine) {
          await supabase
            .from("chat_message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId)
            .eq("emoji", emoji);
        } else {
          const { error } = await supabase
            .from("chat_message_reactions")
            .insert({
              message_id: messageId,
              user_id: currentUserId,
              emoji,
            });
          // 중복 (23505)은 무시
          if (error && error.code !== "23505") throw error;
        }
      } catch (e) {
        console.error("[useChatReactions] toggle error", e);
        // 롤백
        fetchAll();
      }
    },
    [currentUserId, fetchAll]
  );

  return { summaries, toggle, refresh: fetchAll };
}
