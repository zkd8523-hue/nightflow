"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DmThread, DmCounterpart } from "@/types/dm";

/**
 * 현재 유저의 DM 스레드 목록 — 최근 메시지순.
 * 각 스레드에 상대 프로필 + 마지막 메시지 미리보기 채움.
 */
export function useDmThreads(currentUserId?: string) {
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentUserId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("dm_threads")
      .select("*")
      .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .neq("status", "declined")
      .order("last_message_at", { ascending: false })
      .limit(100);

    const list = (rows ?? []) as DmThread[];
    if (list.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const otherIds = [
      ...new Set(list.map((t) => (t.requester_id === currentUserId ? t.recipient_id : t.requester_id))),
    ];
    const threadIds = list.map((t) => t.id);

    const [{ data: profs }, { data: msgs }] = await Promise.all([
      supabase.from("public_user_profiles").select("id, display_name, profile_image").in("id", otherIds),
      supabase
        .from("dm_messages")
        .select("thread_id, content, created_at")
        .in("thread_id", threadIds)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
    ]);

    const pMap = new Map((profs ?? []).map((p) => [p.id, p as DmCounterpart]));
    const lastMap = new Map<string, string>();
    for (const m of msgs ?? []) {
      if (!lastMap.has(m.thread_id as string)) lastMap.set(m.thread_id as string, (m.content as string) ?? "");
    }

    setThreads(
      list.map((t) => {
        const otherId = t.requester_id === currentUserId ? t.recipient_id : t.requester_id;
        return { ...t, counterpart: pMap.get(otherId), last_message: lastMap.get(t.id) ?? null };
      })
    );
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // 실시간: 내 스레드 변화(새 신청/상태변경/새 메시지) 시 목록 갱신
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dm-list:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, load]);

  return { threads, loading, reload: load };
}
