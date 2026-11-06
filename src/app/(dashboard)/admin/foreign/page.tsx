import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ForeignRequestsClient, type ForeignReq } from "@/components/admin/ForeignRequestsClient";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import { mdShortName, poolRoomName } from "@/lib/booking/groupRooms";

export const dynamic = "force-dynamic";

// ?id= — 운영자 알림(확인서 발급·무응답 등)을 누르면 그 예약 카드로 바로 스크롤한다(2026-11-01).
export default async function AdminForeignPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: focusId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/");

  const { data: rows } = await supabase
    .from("foreign_requests")
    .select("id, proposal_token, lang, area, event_date, group_size, budget, selected_menu, selected_menu_total, club_ids, guest_name, assigned_md_id, contact_type, contact_value, backup_email, notes, status, created_at, proposal_sent_at, guest_token, md_seats, md_bump_risk, md_conditions, md_menu, guest_choice, md_reconfirm_state, guest_action_kind, guest_action_sent_at, guest_responded_at, md_response, md_responded_at, md_table_choosable, md_table_options, md_reject_reason, md_required_amount, md_proposed_items, md_reject_note")
    .order("created_at", { ascending: false })
    .limit(200);

  const requests = rows ?? [];

  // club_ids → 클럽명 매핑
  const allClubIds = Array.from(new Set(requests.flatMap((r) => (r.club_ids as string[]) ?? [])));
  const clubNameById: Record<string, string> = {};
  // 영문명 — 단톡방 첫 메시지·방 이름은 손님이 읽으니 영문명부터 쓴다
  const clubNameEnById: Record<string, string> = {};
  if (allClubIds.length > 0) {
    const { data: clubs } = await supabase.from("clubs").select("id, name, name_en").in("id", allClubIds);
    clubs?.forEach((c) => {
      clubNameById[c.id] = c.name;
      if (c.name_en) clubNameEnById[c.id] = c.name_en;
    });
  }

  // 확정서 (있으면 링크·확정 내용 표시)
  const { data: confs } = await supabase
    .from("booking_confirmations")
    .select("request_id, ref_no, public_token, md_token, club_id, table_info, confirmed_group_size, includes, total_price, guest_request, arrival_time, internal_memo, guest_notified_at, guest_notify_channel, guest_viewed_at")
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

  // 단톡방 풀(Migration 707) — 예약에 배정된 방 + MD별 남은 방 수. 표가 아직 없으면 에러만 나고 빈 값으로 간다.
  const adminDb = createAdminClient();
  const { data: roomRows } = await adminDb.from("group_chat_rooms").select("md_id, label, invite_url, status, request_id");
  const roomByReq: Record<string, { label: string; url: string }> = {};
  const poolByMd: Record<string, { free: number; total: number }> = {};
  (roomRows ?? []).forEach((rm) => {
    if (rm.request_id) roomByReq[rm.request_id as string] = { label: rm.label as string, url: rm.invite_url as string };
    const e = (poolByMd[rm.md_id as string] ??= { free: 0, total: 0 });
    e.total++;
    if (rm.status === "free") e.free++;
  });
  // 방을 등록할 수 있는 MD — 클럽 대표 담당자 + 이미 방이 있는 MD
  const { data: repClubs } = await supabase.from("clubs").select("representative_md_id, name, name_en").not("representative_md_id", "is", null);
  const clubOfMd: Record<string, string> = {};
  (repClubs ?? []).forEach((c) => { clubOfMd[c.representative_md_id as string] = (c.name_en as string | null) || (c.name as string); });
  const poolMdIds = Array.from(new Set([...(repClubs ?? []).map((c) => c.representative_md_id as string), ...Object.keys(poolByMd)]));
  const { data: poolMdRows } = poolMdIds.length
    ? await supabase.from("users").select("id, display_name").in("id", poolMdIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const pool = (poolMdRows ?? []).map((m) => ({
    mdId: m.id as string,
    name: (m.display_name as string | null) ?? "(이름없음)",
    short: mdShortName(m.display_name as string | null),
    roomName: poolRoomName(clubOfMd[m.id as string]),
    free: poolByMd[m.id as string]?.free ?? 0,
    total: poolByMd[m.id as string]?.total ?? 0,
  }));

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

  // "클럽이 알아서 골라주세요" 요청(club_ids 빈 배열)에 지정할 후보 — 손님 폼과 같은 예약 가능 기준
  // (isBookable: 주대 + MD 또는 중개 승인). 클럽 미지정 요청이 있을 때만 조회한다(2026-10-02).
  let clubOptions: { id: string; name: string; area: string | null; open_dows: number[] | null }[] = [];
  if (requests.some((r) => ((r.club_ids as string[] | null) ?? []).length === 0)) {
    const menuIds = await fetchMenuClubIds(supabase);
    const { data: cl } = await supabase
      .from("clubs")
      .select("id, name, area, open_dows, foreign_booking_agreed, partners:club_partners(md_id)")
      .is("deleted_at", null)
      .eq("is_test", false)
      .order("google_review_count", { ascending: false, nullsFirst: false });
    clubOptions = (cl ?? [])
      .filter((c) =>
        isBookable({
          name: c.name,
          has_md: ((c.partners as { md_id: string }[] | null)?.length ?? 0) > 0,
          agreed: !!c.foreign_booking_agreed,
          has_menu: menuIds.has(c.id),
        })
      )
      .map((c) => ({ id: c.id, name: c.name, area: c.area, open_dows: (c.open_dows as number[] | null) ?? null }));
  }

  // 담당자가 테스트 계정(is_test)인 요청은 목록·통계에서 기본 숨김 — 지우지 않아도 실제 요청과 섞이지 않는다(2026-11-06).
  const assignedIds = Array.from(new Set(requests.map((r) => r.assigned_md_id as string | null).filter((x): x is string => !!x)));
  const { data: testMdRows } = assignedIds.length ? await supabase.from("users").select("id").in("id", assignedIds).eq("is_test", true) : { data: [] as { id: string }[] };
  const testMdIds = new Set((testMdRows ?? []).map((u) => u.id));

  const enriched: ForeignReq[] = requests.map((r) => ({
    ...r,
    isTest: !!r.assigned_md_id && testMdIds.has(r.assigned_md_id as string),
    club_ids: (r.club_ids as string[]) ?? [],
    clubNames: ((r.club_ids as string[]) ?? []).map((id) => clubNameById[id] ?? id.slice(0, 8)),
    clubNameEn: clubNameEnById[((r.club_ids as string[]) ?? [])[0]] ?? null,
    conf: confByReq[r.id] ?? null,
    chatRoom: roomByReq[r.id] ?? null,
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
        <ForeignRequestsClient initial={enriched} allMds={allMds} clubOptions={clubOptions} focusId={focusId ?? null} pool={pool} />
      </div>
    </div>
  );
}
