import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ForeignRequestsClient, type ForeignReq } from "@/components/admin/ForeignRequestsClient";

export const dynamic = "force-dynamic";

export default async function AdminForeignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/");

  const { data: rows } = await supabase
    .from("foreign_requests")
    .select("id, proposal_token, lang, area, event_date, group_size, budget, selected_menu, selected_menu_total, club_ids, guest_name, assigned_md_id, contact_type, contact_value, backup_email, notes, status, created_at, md_response, md_responded_at, md_table_choosable, md_table_options, md_reject_reason, md_required_amount, md_proposed_items, md_reject_note")
    .order("created_at", { ascending: false })
    .limit(200);

  const requests = rows ?? [];

  // club_ids → 클럽명 매핑
  const allClubIds = Array.from(new Set(requests.flatMap((r) => (r.club_ids as string[]) ?? [])));
  const clubNameById: Record<string, string> = {};
  if (allClubIds.length > 0) {
    const { data: clubs } = await supabase.from("clubs").select("id, name").in("id", allClubIds);
    clubs?.forEach((c) => { clubNameById[c.id] = c.name; });
  }

  // 확정서 (있으면 링크·확정 내용 표시)
  const { data: confs } = await supabase
    .from("booking_confirmations")
    .select("request_id, ref_no, public_token, md_token, club_id, table_info, confirmed_group_size, includes, total_price, guest_request, internal_memo, guest_notified_at, guest_notify_channel, guest_viewed_at")
    .in("request_id", requests.length ? requests.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);
  // 손님 벨 알림 읽음 여부 — 어드민 카드 "손님 전달 상태"용(2026-10-01).
  // in_app_notifications는 본인만 읽는 RLS라 service role로 읽는다.
  const bellReadByPath: Record<string, boolean> = {};
  const guestPaths = (confs ?? []).map((c) => `/booking/${c.public_token}`);
  if (guestPaths.length) {
    const { data: bells } = await createAdminClient()
      .from("in_app_notifications")
      .select("action_url, is_read")
      .in("action_url", guestPaths);
    bells?.forEach((b) => {
      if (b.action_url) bellReadByPath[b.action_url] = (bellReadByPath[b.action_url] ?? false) || b.is_read;
    });
  }
  const confByReq: Record<string, NonNullable<typeof confs>[number] & { guest_bell_read: boolean | null }> = {};
  confs?.forEach((c) => {
    const path = `/booking/${c.public_token}`;
    confByReq[c.request_id] = { ...c, guest_bell_read: path in bellReadByPath ? bellReadByPath[path] : null };
  });

  // 담당 MD 후보 — 요청에 걸린 클럽들의 파트너.
  // 전체 MD를 다 내려주면 목록이 길어 못 쓴다.
  const { data: partners } = await supabase
    .from("club_partners")
    .select("club_id, md_id")
    .in("club_id", allClubIds.length ? allClubIds : ["00000000-0000-0000-0000-000000000000"]);
  const mdIds = Array.from(new Set((partners ?? []).map((p) => p.md_id)));
  const { data: mds } = mdIds.length
    ? await supabase.from("users").select("id, display_name, phone").in("id", mdIds)
    : { data: [] as { id: string; display_name: string | null; phone: string | null }[] };
  // phone을 그대로 넘긴다 — 예전엔 hasPhone(있다/없다)만 보내서, 운영자가
  // 링크를 복사한 뒤 번호는 다른 데서 찾아 카톡을 보내야 했다.
  const mdById: Record<string, { id: string; name: string; phone: string | null }> = {};
  mds?.forEach((m) => {
    mdById[m.id] = { id: m.id, name: m.display_name ?? "(이름없음)", phone: m.phone };
  });
  const mdsByClub: Record<string, string[]> = {};
  (partners ?? []).forEach((p) => {
    (mdsByClub[p.club_id] = mdsByClub[p.club_id] ?? []).push(p.md_id);
  });

  // 승인된 MD 전체 — 여러 클럽을 맡는데 club_partners엔 한 클럽만 걸린 MD가
  // 있어서, 요청 클럽의 파트너만으론 지정할 수 없는 경우가 생긴다(2026-09-29).
  // 목록 기본값은 여전히 클럽 파트너이고, 이 전체 목록은 이름 검색할 때만 쓴다.
  const { data: approvedMds } = await supabase
    .from("users")
    .select("id, display_name, phone")
    .eq("role", "md")
    .eq("md_status", "approved")
    .is("deleted_at", null)
    .order("display_name");
  const allMds = (approvedMds ?? []).map((m) => ({ id: m.id, name: m.display_name ?? "(이름없음)", phone: m.phone }));

  const enriched: ForeignReq[] = requests.map((r) => ({
    ...r,
    club_ids: (r.club_ids as string[]) ?? [],
    clubNames: ((r.club_ids as string[]) ?? []).map((id) => clubNameById[id] ?? id.slice(0, 8)),
    conf: confByReq[r.id] ?? null,
    mdCandidates: Array.from(
      new Set(((r.club_ids as string[]) ?? []).flatMap((cid) => mdsByClub[cid] ?? []))
    )
      .map((id) => mdById[id])
      .filter(Boolean),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">🌏 외국인 요청</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            컨시어지 — 클럽 MD에 직접 연락(카톡/전화)해서 자리·가격 확정 후, 아래 연락처로 회신하세요.
          </p>
        </div>
        <ForeignRequestsClient initial={enriched} allMds={allMds} />
      </div>
    </div>
  );
}
