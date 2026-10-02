// 운영자가 외국인 요청에 클럽을 지정한다(2026-10-02).
//
// 손님이 "클럽이 알아서 골라주세요"로 보내면 club_ids가 빈 채로 들어온다. 제안서(받는 MD 후보),
// 확정서(확정 클럽), MD 알림, 손님 메일이 전부 club_ids[0]을 읽으므로 여기서 그 자리를 채워
// 이후 흐름을 기존 그대로 태운다.
//
// 이미 클럽이 정해진 요청은 바꾸지 않는다 — 담당 MD·제안서 링크·확정서가 그 클럽 기준으로
// 이미 나갔을 수 있어서, 조용히 갈아끼우면 MD가 받은 링크와 실제 클럽이 어긋난다.
//
// POST Body: { request_id, club_id }
// 200: { ok: true, club_ids, club_name, md_candidates }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { request_id?: string; club_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const requestId = body.request_id;
  const clubId = body.club_id;
  if (!requestId || !clubId) return NextResponse.json({ error: "request_id_and_club_id_required" }, { status: 400 });

  const sb = createAdminClient();
  const { data: row, error } = await sb
    .from("foreign_requests")
    .select("id, club_ids")
    .eq("id", requestId)
    .single();
  if (error || !row) return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  if (((row.club_ids as string[] | null) ?? []).length > 0) {
    return NextResponse.json({ error: "이미 클럽이 정해진 요청이에요" }, { status: 409 });
  }

  const { data: club } = await sb.from("clubs").select("id, name").eq("id", clubId).maybeSingle();
  if (!club) return NextResponse.json({ error: "club_not_found" }, { status: 404 });

  // 빈 배열일 때만 채운다 — 두 운영자가 동시에 지정해도 먼저 저장한 쪽만 남는다.
  const { data: updated, error: upErr } = await sb
    .from("foreign_requests")
    .update({ club_ids: [club.id], updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .or("club_ids.is.null,club_ids.eq.{}")
    .select("club_ids")
    .maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "이미 클럽이 정해진 요청이에요" }, { status: 409 });

  // 받는 MD 후보 — /admin/foreign 페이지가 계산하는 것과 같은 기준(그 클럽의 club_partners).
  // 화면이 새로고침 없이 바로 MD를 고를 수 있게 같이 돌려준다.
  const { data: partners } = await sb.from("club_partners").select("md_id").eq("club_id", club.id);
  const mdIds = Array.from(new Set((partners ?? []).map((p) => p.md_id)));
  const { data: mds } = mdIds.length
    ? await sb.from("users").select("id, display_name, phone").in("id", mdIds)
    : { data: [] as { id: string; display_name: string | null; phone: string | null }[] };
  const mdCandidates = (mds ?? []).map((m) => ({ id: m.id, name: m.display_name ?? "(이름없음)", phone: m.phone }));

  return NextResponse.json({ ok: true, club_ids: updated.club_ids, club_name: club.name, md_candidates: mdCandidates });
}
