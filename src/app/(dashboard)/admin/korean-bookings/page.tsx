import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KoreanBookingsClient, type KoreanBookingReq } from "@/components/admin/KoreanBookingsClient";

export const dynamic = "force-dynamic";

export default async function AdminKoreanBookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/");

  const { data: rows } = await supabase
    .from("korean_booking_requests")
    .select(
      "id, club_id, event_date, group_size, selected_menu, selected_menu_total, guest_name, contact_type, contact_value, notes, status, created_at, proposal_token, assigned_md_id, md_response, md_responded_at, md_table_choosable, md_table_options, md_reject_reason, md_required_amount, md_proposed_items, md_reject_note, guest_notice, guest_notice_at, cancelled_by, cancel_reason, cancel_note, cancelled_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const requests = rows ?? [];

  // club_id → 클럽명 매핑
  const clubIds = Array.from(new Set(requests.map((r) => r.club_id)));
  const clubNameById: Record<string, string> = {};
  if (clubIds.length > 0) {
    const { data: clubs } = await supabase.from("clubs").select("id, name").in("id", clubIds);
    clubs?.forEach((c) => { clubNameById[c.id] = c.name; });
  }

  // 확정서 (있으면 링크·확정 내용 표시) — foreign_requests와 같은 테이블을
  // request_type='korean'으로 구분해서 공유한다(Migration 654).
  const { data: confs } = await supabase
    .from("booking_confirmations")
    .select("request_id, ref_no, public_token, md_token, club_id, table_info, confirmed_group_size, includes, total_price, guest_request, internal_memo, guest_notified_at, guest_notify_channel, guest_viewed_at")
    .eq("request_type", "korean")
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

  // 담당 MD 후보 — 요청에 걸린 클럽의 파트너. foreign_requests 관리자 화면과 동일 패턴.
  const { data: partners } = await supabase
    .from("club_partners")
    .select("club_id, md_id")
    .in("club_id", clubIds.length ? clubIds : ["00000000-0000-0000-0000-000000000000"]);
  const mdIds = Array.from(new Set((partners ?? []).map((p) => p.md_id)));
  const { data: mds } = mdIds.length
    ? await supabase.from("users").select("id, display_name, phone").in("id", mdIds)
    : { data: [] as { id: string; display_name: string | null; phone: string | null }[] };
  const mdById: Record<string, { id: string; name: string; phone: string | null }> = {};
  mds?.forEach((m) => {
    mdById[m.id] = { id: m.id, name: m.display_name ?? "(이름없음)", phone: m.phone };
  });
  const mdsByClub: Record<string, string[]> = {};
  (partners ?? []).forEach((p) => {
    (mdsByClub[p.club_id] = mdsByClub[p.club_id] ?? []).push(p.md_id);
  });

  // 승인된 MD 전체 — 외국인 요청 화면과 동일(여러 클럽 담당 MD가 한 클럽에만
  // 파트너로 걸려 있어도 이름 검색으로 지정할 수 있게, 2026-09-29).
  const { data: approvedMds } = await supabase
    .from("users")
    .select("id, display_name, phone")
    .eq("role", "md")
    .eq("md_status", "approved")
    .is("deleted_at", null)
    .order("display_name");
  const allMds = (approvedMds ?? []).map((m) => ({ id: m.id, name: m.display_name ?? "(이름없음)", phone: m.phone }));

  const enriched: KoreanBookingReq[] = requests.map((r) => ({
    ...r,
    // korean_booking_requests에는 budget 컬럼이 없다(Migration 652 — 예산은
    // selected_menu_total로 갈음). 제안서 공용 컴포넌트가 budget을 받으므로
    // 다른 한국 트랙 화면들과 같이 null로 맞춘다.
    budget: null,
    clubName: clubNameById[r.club_id] ?? r.club_id.slice(0, 8),
    mdCandidates: (mdsByClub[r.club_id] ?? []).map((id) => mdById[id]).filter(Boolean),
    conf: confByReq[r.id] ?? null,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">🍾 한국 예약 요청</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            컨시어지 — 클럽 MD에 직접 연락(카톡/전화)해서 자리·가격 확정 후, 아래 연락처로 회신하세요.
          </p>
        </div>
        <KoreanBookingsClient initial={enriched} allMds={allMds} />
      </div>
    </div>
  );
}
