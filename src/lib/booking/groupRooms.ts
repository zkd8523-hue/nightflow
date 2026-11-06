// 단톡방 풀(2026-11-04, Migration 707) — 미리 만들어 둔 WhatsApp 방을 확인서가 나올 때 하나 배정한다.
// 서버 전용(service role). 표가 아직 없거나 조회가 실패하면 "방 없음"으로 다룬다 — 확인서 발급을 막지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type GroupRoom = {
  id: string;
  md_id: string;
  label: string;
  invite_url: string;
  status: "free" | "assigned";
  request_type: "foreign" | "korean" | null;
  request_id: string | null;
  assigned_at: string | null;
};

const COLS = "id, md_id, label, invite_url, status, request_type, request_id, assigned_at";

/** 방 이름에 쓸 MD 짧은 이름 — "레이스&사운드 우현 (에이스)" → "우현" */
export const mdShortName = (displayName: string | null | undefined) =>
  (displayName ?? "MD").replace(/\([^)]*\)/g, "").trim().split(/\s+/).pop() || "MD";

/** 손님이 보는 방 이름 — "클럽명 · NightFlow"(예: Club Ace · NightFlow). 모든 방이 같은 이름이라 예약마다 이름을 바꿀 필요가 없다(2026-11-04 사용자 결정). */
export const poolRoomName = (clubName: string | null | undefined) => `${(clubName ?? "").trim() || "Club"} · NightFlow`;

/** WhatsApp 그룹 초대 링크만 받는다. 쿼리스트링은 떼고 정규화한다. */
export function cleanInvite(raw: string | null | undefined): string | null {
  const m = (raw ?? "").trim().match(/https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/);
  return m ? `https://chat.whatsapp.com/${m[1]}` : null;
}

export async function roomOfRequest(sb: SupabaseClient, requestType: "foreign" | "korean", requestId: string): Promise<GroupRoom | null> {
  const { data, error } = await sb.from("group_chat_rooms").select(COLS).eq("request_type", requestType).eq("request_id", requestId).maybeSingle();
  if (error) return null;
  return (data as GroupRoom | null) ?? null;
}

export async function freeCount(sb: SupabaseClient, mdId: string): Promise<number> {
  const { count } = await sb.from("group_chat_rooms").select("*", { count: "exact", head: true }).eq("md_id", mdId).eq("status", "free");
  return count ?? 0;
}

/**
 * 이 예약에 방을 배정한다. 이미 있으면 그대로 돌려주고, 없으면 그 MD의 안 쓴 방 중 가장 오래된 걸 가져간다.
 * 안 쓴 방이 없으면 room=null — 부르는 쪽이 운영자에게 "방을 더 만들어 달라"고 알린다.
 */
export async function assignGroupRoom(
  sb: SupabaseClient,
  o: { requestType: "foreign" | "korean"; requestId: string; mdId: string },
): Promise<{ room: GroupRoom | null; remaining: number; fresh: boolean }> {
  const existing = await roomOfRequest(sb, o.requestType, o.requestId);
  if (existing) return { room: existing, remaining: await freeCount(sb, existing.md_id), fresh: false };

  for (let i = 0; i < 3; i++) {
    const { data: free, error } = await sb
      .from("group_chat_rooms").select(COLS)
      .eq("md_id", o.mdId).eq("status", "free")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !free) break;
    // 동시에 두 예약이 같은 방을 집지 않게 status=free일 때만 가져간다.
    const { data: claimed, error: upErr } = await sb
      .from("group_chat_rooms")
      .update({ status: "assigned", request_type: o.requestType, request_id: o.requestId, assigned_at: new Date().toISOString() })
      .eq("id", (free as GroupRoom).id).eq("status", "free")
      .select(COLS).maybeSingle();
    if (upErr) {
      // 같은 예약이 동시에 배정된 경우(유일 인덱스) — 이미 잡힌 방을 돌려준다.
      const again = await roomOfRequest(sb, o.requestType, o.requestId);
      if (again) return { room: again, remaining: await freeCount(sb, again.md_id), fresh: false };
      break;
    }
    if (claimed) return { room: claimed as GroupRoom, remaining: await freeCount(sb, o.mdId), fresh: true };
  }
  return { room: null, remaining: 0, fresh: false };
}
