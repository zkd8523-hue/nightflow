import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, lang, area, event_date, group_size, budget, club_ids, contact_type, contact_value, notes, status, created_at")
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

  const enriched: ForeignReq[] = requests.map((r) => ({
    ...r,
    club_ids: (r.club_ids as string[]) ?? [],
    clubNames: ((r.club_ids as string[]) ?? []).map((id) => clubNameById[id] ?? id.slice(0, 8)),
  }));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight">🌏 외국인 요청</h1>
          <p className="text-[13px] text-neutral-500 mt-1">
            컨시어지 — 클럽 MD에 직접 연락(카톡/전화)해서 자리·가격 확정 후, 아래 연락처로 회신하세요.
          </p>
        </div>
        <ForeignRequestsClient initial={enriched} />
      </div>
    </div>
  );
}
