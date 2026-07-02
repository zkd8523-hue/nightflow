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
 * 조각 단체채팅 메시지 이모지 반응 (useChatReactions 포크 — puzzle_party_reactions).
 * puzzleId로 realtime 구독해 실시간 반영.
 */
export function usePartyReactions(
  puzzleId: string,
  messageIds: string[],
  currentUserId?: string
) {
  const [summaries, setSummaries] = useState<Map<string, ChatReactionSummary>>(new Map());
  const messageIdsKey = useMemo(() => messageIds.slice().sort().join(","), [messageIds]);

  const fetchAll = useCallback(async () => {
    const ids = messageIdsKey ? messageIdsKey.split(",") : [];
    if (ids.length === 0) {
      setSummaries((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("puzzle_party_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    if (error) {
      console.error("[usePartyReactions] fetch error", error);
      return;
    }
    const map = new Map<string, ChatReactionSummary>();
    for (const id of ids) map.set(id, { counts: emptyCounts(), mine: new Set() });
    for (const r of (data ?? []) as ChatReactionRow[]) {
      const s = map.get(r.message_id);
      if (!s) continue;
      if (CHAT_REACTION_EMOJIS.includes(r.emoji)) {
        s.counts[r.emoji] += 1;
        if (currentUserId && r.user_id === currentUserId) s.mine.add(r.emoji);
      }
    }
    setSummaries(map);
  }, [messageIdsKey, currentUserId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 실시간: 이 조각의 반응 변화 → 재조회
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`party-react:${puzzleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_party_reactions" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [puzzleId, fetchAll]);

  const toggle = useCallback(
    async (messageId: string, emoji: ChatReactionEmoji) => {
      if (!currentUserId) return;
      const supabase = createClient();
      let wasMine = false;
      setSummaries((prev) => {
        const next = new Map(prev);
        const s = next.get(messageId) ?? { counts: emptyCounts(), mine: new Set<ChatReactionEmoji>() };
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
            .from("puzzle_party_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId)
            .eq("emoji", emoji);
        } else {
          const { error } = await supabase
            .from("puzzle_party_reactions")
            .insert({ message_id: messageId, user_id: currentUserId, emoji });
          if (error && error.code !== "23505") throw error;
        }
      } catch (e) {
        console.error("[usePartyReactions] toggle error", e);
        fetchAll();
      }
    },
    [currentUserId, fetchAll]
  );

  return { summaries, toggle, refresh: fetchAll };
}
