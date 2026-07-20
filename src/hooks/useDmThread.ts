"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMediaItem } from "@/types/database";
import type { DmMessage, DmThread, DmCounterpart } from "@/types/dm";

/**
 * 단일 DM 스레드 — 메타(dm_threads) + 메시지(dm_messages) 로드 + 실시간 구독.
 * (useOfferMessages 패턴 포크)
 */
export function useDmThread(threadId: string | null, currentUserId?: string) {
  const [thread, setThread] = useState<DmThread | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [{ data: t }, { data: msgs }] = await Promise.all([
      supabase.from("dm_threads").select("*").eq("id", threadId).maybeSingle(),
      supabase
        .from("dm_messages")
        .select("id, thread_id, sender_id, content, media, is_deleted, read_at, created_at, reply_to")
        .eq("thread_id", threadId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    if (t) {
      // 상대방 프로필
      const otherId = t.requester_id === currentUserId ? t.recipient_id : t.requester_id;
      const { data: prof } = await supabase
        .from("public_user_profiles")
        .select("id, display_name, profile_image")
        .eq("id", otherId)
        .maybeSingle();
      setThread({ ...(t as DmThread), counterpart: (prof ?? undefined) as DmCounterpart | undefined });
    } else {
      setThread(null);
    }
    setMessages((msgs ?? []) as DmMessage[]);
    setLoading(false);
  }, [threadId, currentUserId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // 실시간: 이 스레드 메시지 INSERT + 스레드 status UPDATE
  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dm:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const m = payload.new as DmMessage;
          if (m.is_deleted) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_threads", filter: `id=eq.${threadId}` },
        (payload) => {
          const t = payload.new as DmThread;
          setThread((prev) => (prev ? { ...prev, ...t } : prev));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  const send = useCallback(
    async (content: string, media: ChatMediaItem[] = [], replyTo: string | null = null) => {
      if (!threadId || !currentUserId) return;
      const body = content.trim();
      if (!body && media.length === 0) return;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dm_messages")
        .insert({ thread_id: threadId, sender_id: currentUserId, content: body, media, reply_to: replyTo })
        .select("id, thread_id, sender_id, content, media, is_deleted, read_at, created_at, reply_to")
        .maybeSingle();
      if (error) {
        console.error("[useDmThread] send error", error);
        return;
      }
      if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as DmMessage]));
    },
    [threadId, currentUserId]
  );

  // respond(수락/거절)는 Migration 470에서 폐기 — 게이트 없이 바로 대화

  return { thread, messages, loading, send, reload: load };
}
