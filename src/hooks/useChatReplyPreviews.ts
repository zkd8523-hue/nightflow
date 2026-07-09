"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, ChatRoomCode } from "@/types/database";

export interface ReplyPreview {
  /** 미리보기용 최근 답글 (오래된→최신, 최대 2개) */
  preview: ChatMessage[];
  /** 실제 답글 총 개수 (reply_count 컬럼이 아니라 직접 카운트) */
  total: number;
}

/**
 * 여러 부모 메시지의 "최근 답글 미리보기"를 한 번에 조회 (피드 인라인 표시용).
 *   - ⚠️ chat_messages.reply_count 컬럼은 트리거 미동작으로 신뢰 불가 →
 *     실제 답글 row를 직접 조회해 카운트/미리보기를 만든다.
 *   - 카톡 오픈챗처럼 피드에서 답글을 바로 보여주기 위함.
 *
 * @param parentIds 피드의 최상위 메시지 id 목록 (reply_count 무관, 전부 넘긴다)
 * @param version   새 답글 감지용 시그널(옵티미스틱 reply_count 합 등) — 바뀌면 재조회
 */
export function useChatReplyPreviews(parentIds: string[], version: number) {
  const [previews, setPreviews] = useState<Map<string, ReplyPreview>>(
    new Map()
  );

  // parentIds를 안정적인 키로 (정렬 후 join)
  const key = useMemo(() => [...parentIds].sort().join(","), [parentIds]);

  useEffect(() => {
    if (parentIds.length === 0) {
      setPreviews(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("chat_messages")
        .select(
          `
          id, room, author_id, parent_id, content, media, author_area, club_tags,
          is_deleted, created_at,
          author:public_user_profiles!chat_messages_author_id_fkey(id, display_name, profile_image)
        `
        )
        .in("parent_id", parentIds)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (error || !data) {
        console.error("[useChatReplyPreviews] fetch error", error);
        setPreviews(new Map());
        return;
      }

      // 부모별로 그룹 (created_at desc로 들어옴)
      const grouped = new Map<string, ChatMessage[]>();
      for (const d of data) {
        const pid = (d as { parent_id?: string | null }).parent_id ?? null;
        if (!pid) continue;
        const rawAuthor = (d as { author?: unknown }).author;
        const authorObj = Array.isArray(rawAuthor)
          ? (rawAuthor[0] as ChatMessage["author"])
          : (rawAuthor as ChatMessage["author"]);
        const msg: ChatMessage = {
          id: d.id,
          room: d.room as ChatRoomCode,
          author_id: d.author_id,
          parent_id: pid,
          reply_count: 0,
          content: d.content,
          media: ((d as { media?: ChatMessage["media"] }).media ??
            []) as ChatMessage["media"],
          author_area:
            (d as { author_area?: ChatMessage["author_area"] }).author_area ??
            null,
          club_tags: ((d as { club_tags?: string[] }).club_tags ?? []) as string[],
          is_deleted: d.is_deleted,
          created_at: d.created_at,
          author: authorObj,
          quoted_message_id: null,
          quoted_message: null,
        };
        const arr = grouped.get(pid) ?? [];
        arr.push(msg);
        grouped.set(pid, arr);
      }

      const result = new Map<string, ReplyPreview>();
      for (const [pid, arr] of grouped) {
        // arr는 최신순 → 최근 2개를 오래된→최신으로 뒤집어 미리보기
        const preview = arr.slice(0, 2).reverse();
        result.set(pid, { preview, total: arr.length });
      }
      setPreviews(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  return previews;
}
