// 운영자가 외국인/한국 요청에 담당 MD와 확정 내용을 입력해 확인서를 발급한다.
// 요청(손님 희망)과 확정(MD 합의)을 분리해 저장 — 예산과 확정가가 섞이면 구분이 사라진다.
//
// 두 트랙(foreign_requests, korean_booking_requests)이 컬럼 구조는 같지만
// 테이블이 다르다 — request_type으로 분기한다(2026-09-06, Migration 654).
// booking_confirmations은 request_type+request_id 조합으로 1:1을 보장한다.
//
// POST Body: {
//   request_type?: "foreign" | "korean" (기본 foreign, 하위호환),
//   request_id, assigned_md_id?, club_id?, table_info?, capacity_note?,
//   includes?: string[], total_price?, confirmed_group_size?, arrival_time?, guest_request?, internal_memo?
// }
// 200: { ok: true, ref_no, public_token, url }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 클럽명 단어별 첫 글자 이니셜 (예: "Club Ace" → "CA"). "Club"으로 시작하는
// 클럽이 8개나 있어 앞 2자 그대로 쓰면("CL") 전부 겹친다. 단어가 1개뿐이면
// 그 단어 앞 2자를 쓴다(예: "Fountain" → "FO"). 영문 이니셜을 못 뽑으면(한글
// 이름) NF로 폴백한다.
function clubPrefix(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w.replace(/[^A-Za-z]/g, "")[0] ?? "").join("");
  if (initials.length >= 2) return initials.slice(0, 2).toUpperCase();

  const ascii = name.replace(/[^A-Za-z]/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 2).toUpperCase();
  return "NF";
}

export async function POST(req: NextRequest) {
  // 인증 — admin만
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const requestId = body.request_id as string | undefined;
  if (!requestId) return NextResponse.json({ error: "request_id_required" }, { status: 400 });

  const requestType = body.request_type === "korean" ? "korean" : "foreign";
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  // foreign_requests는 club_ids(배열, 우선순위 최대 3곳), korean_booking_requests는
  // club_id(단일) — 조회 컬럼만 분기하고 이후 로직은 배열로 통일해 다룬다.
  const clubIdColumn = requestType === "korean" ? "club_id" : "club_ids";

  const sb = createAdminClient();

  const { data: reqRow, error: reqErr } = await sb
    .from(table)
    .select(`id, ${clubIdColumn}, event_date`)
    .eq("id", requestId)
    .single();
  if (reqErr || !reqRow) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }
  const reqClubIds =
    requestType === "korean"
      ? [(reqRow as unknown as { club_id: string }).club_id]
      : ((reqRow as unknown as { club_ids: string[] | null }).club_ids ?? []);

  // 담당 MD 지정 (요청 쪽에 저장 — 도착 알림이 여기를 읽는다)
  if (body.assigned_md_id !== undefined) {
    await sb
      .from(table)
      .update({ assigned_md_id: body.assigned_md_id || null, updated_at: new Date().toISOString() })
      .eq("id", requestId);
  }

  // 확정 클럽 — 미지정이면 요청의 1순위를 쓴다.
  const clubId = (body.club_id as string | undefined) || reqClubIds[0] || null;

  let clubName = "";
  if (clubId) {
    const { data: club } = await sb.from("clubs").select("name").eq("id", clubId).single();
    clubName = club?.name ?? "";
  }

  // 이미 확정서가 있으면 ref_no를 유지한다 — 손님에게 이미 보낸 번호가 바뀌면 안 된다.
  const { data: existing } = await sb
    .from("booking_confirmations")
    .select("id, ref_no, public_token, md_token")
    .eq("request_type", requestType)
    .eq("request_id", requestId)
    .maybeSingle();

  const refNo =
    existing?.ref_no ??
    `${clubPrefix(clubName || "NightFlow")}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  const payload = {
    request_type: requestType,
    request_id: requestId,
    club_id: clubId,
    ref_no: refNo,
    table_info: (body.table_info as string) || null,
    capacity_note: (body.capacity_note as string) || null,
    confirmed_group_size: (body.confirmed_group_size as string) || null,
    includes: (body.includes as string[]) ?? [],
    total_price: (body.total_price as number) || null,
    arrival_time: (body.arrival_time as string) || null,
    guest_request: (body.guest_request as string) || null,
    internal_memo: (body.internal_memo as string) || null,
    created_by: user.id,
  };

  const { data: saved, error: saveErr } = await sb
    .from("booking_confirmations")
    .upsert(payload, { onConflict: "request_type,request_id" })
    .select("ref_no, public_token, md_token")
    .single();

  if (saveErr || !saved) {
    return NextResponse.json({ error: saveErr?.message ?? "save_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ref_no: saved.ref_no,
    public_token: saved.public_token,
    md_token: saved.md_token,
    url: `/booking/${saved.public_token}`,
    md_url: `/booking/md/${saved.md_token}`,
  });
}
