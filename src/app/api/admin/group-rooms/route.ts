// 단톡방 풀 관리(2026-11-04, Migration 707) — 관리자 전용.
//
//   add    { md_id, links: string[] } — 미리 만들어 둔 방(MD가 들어 있는 빈 방)의 초대 링크를 한꺼번에 등록
//   assign { request_id }             — 이 예약에 안 쓴 방 하나를 배정(확인서 때 방이 없었을 때 나중에 누르는 용도)
//   link   { request_id, url }        — 풀에 없는 방의 링크를 이 예약에 직접 연결
//
// assign·link로 방이 새로 붙으면 손님에게 링크 메일을 한 번 보낸다(확인서 메일에 못 실었으니까).
// 확인서 때 자동 배정된 방은 확정 메일에 이미 실려 나간다 — notifyAssignedMd.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignGroupRoom, cleanInvite, freeCount, mdShortName, roomOfRequest } from "@/lib/booking/groupRooms";
import { loadForeignReq, loadClub } from "@/lib/booking/guestFlows";
import { guestEmailOf } from "@/lib/email/foreignGuest";
import { sendGroupChatInviteEmail } from "@/lib/email/groupChatInvite";
import { chatLang, guestGreeting } from "@/lib/booking/groupChat";

async function mailGuest(sb: ReturnType<typeof createAdminClient>, requestId: string, chatUrl: string): Promise<boolean> {
  const r = await loadForeignReq(sb, { id: requestId });
  if (!r || r.status === "cancelled") return false;
  const to = guestEmailOf(r);
  const { data: conf } = await sb.from("booking_confirmations").select("ref_no, public_token, table_info, includes, total_price, confirmed_group_size, arrival_time").eq("request_type", "foreign").eq("request_id", requestId).maybeSingle();
  if (!to || !conf) return false;
  const club = await loadClub(sb, r.club_ids?.[0]);
  try {
    await sendGroupChatInviteEmail(to, {
      lang: r.lang, refNo: conf.ref_no, chatUrl, passUrl: `https://nightflow.kr/booking/${conf.public_token}`,
      clubName: club?.name_en || club?.name || null, eventDate: r.event_date,
      greeting: guestGreeting({
        lang: chatLang(r.lang), guestName: r.guest_name, refNo: conf.ref_no, club: club?.name_en || club?.name || "the club",
        eventDate: r.event_date, groupSize: String(conf.confirmed_group_size ?? r.group_size).trim(),
        tableInfo: conf.table_info, includes: conf.includes ?? [], menuLines: r.md_menu?.lines ?? null,
        total: conf.total_price, arrivalTime: conf.arrival_time ?? null,
      }),
    });
    return true;
  } catch (e) {
    console.error("[group-rooms] 손님 링크 메일 실패", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { action?: string; md_id?: string; links?: string[]; request_id?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sb = createAdminClient();

  if (body.action === "add") {
    if (!body.md_id || !Array.isArray(body.links)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
    const { data: md } = await sb.from("users").select("display_name").eq("id", body.md_id).maybeSingle();
    if (!md) return NextResponse.json({ error: "md_not_found" }, { status: 404 });
    const short = mdShortName(md.display_name);
    const { count } = await sb.from("group_chat_rooms").select("*", { count: "exact", head: true }).eq("md_id", body.md_id);
    let n = count ?? 0;
    const added: string[] = [];
    const invalid: string[] = [];
    const dup: string[] = [];
    for (const raw of body.links.slice(0, 50)) {
      const url = cleanInvite(raw);
      if (!url) { if (raw.trim()) invalid.push(raw.trim().slice(0, 60)); continue; }
      const label = `${short} 방 #${n + 1}`;
      const { error } = await sb.from("group_chat_rooms").insert({ md_id: body.md_id, label, invite_url: url });
      if (error) { dup.push(url); continue; }
      n++;
      added.push(label);
    }
    const { count: total } = await sb.from("group_chat_rooms").select("*", { count: "exact", head: true }).eq("md_id", body.md_id);
    return NextResponse.json({ ok: true, added, invalid, duplicate: dup, free: await freeCount(sb, body.md_id), total: total ?? 0 });
  }

  if (body.action === "assign" || body.action === "link") {
    if (!body.request_id) return NextResponse.json({ error: "bad_params" }, { status: 400 });
    const r = await loadForeignReq(sb, { id: body.request_id });
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!r.assigned_md_id) return NextResponse.json({ error: "md_required" }, { status: 409 });
    const have = await roomOfRequest(sb, "foreign", r.id);

    if (body.action === "assign") {
      if (have) return NextResponse.json({ ok: true, already: true, room: have });
      const res = await assignGroupRoom(sb, { requestType: "foreign", requestId: r.id, mdId: r.assigned_md_id });
      if (!res.room) return NextResponse.json({ error: "no_free_room" }, { status: 409 });
      const mailed = await mailGuest(sb, r.id, res.room.invite_url);
      return NextResponse.json({ ok: true, room: res.room, remaining: res.remaining, mailed });
    }

    const url = cleanInvite(body.url);
    if (!url) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
    if (have) return NextResponse.json({ error: "already_assigned" }, { status: 409 });
    const { data: room, error } = await sb.from("group_chat_rooms").insert({
      md_id: r.assigned_md_id, label: "직접 연결", invite_url: url,
      status: "assigned", request_type: "foreign", request_id: r.id, assigned_at: new Date().toISOString(),
    }).select("id, md_id, label, invite_url, status, request_type, request_id, assigned_at").single();
    if (error || !room) return NextResponse.json({ error: error?.code === "23505" ? "link_in_use" : "insert_failed" }, { status: 409 });
    const mailed = await mailGuest(sb, r.id, room.invite_url);
    return NextResponse.json({ ok: true, room, mailed });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
