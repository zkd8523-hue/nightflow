import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminShareSlotManager } from "@/components/admin/AdminShareSlotManager";
import type { ClubRow, PartnerMd, SlotRow } from "@/components/admin/AdminShareSlotManager";

export const dynamic = "force-dynamic";

// KST 기준 이번 주 월요일(YYYY-MM-DD)
function getKstThisMonday(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay(); // 0=일~6=토
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  return monday.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface RawPartner {
  md_id: string;
  user: {
    id: string;
    name: string | null;
    display_name: string | null;
    instagram: string | null;
  } | null;
}

interface RawClub {
  id: string;
  name: string;
  area: string | null;
  partners: RawPartner[] | null;
}

export default async function AdminShareSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/");

  // 조각 슬롯은 claim_share_slot과 동일하게 이번 주 ~ 다음 주(+7)만 선점 가능
  const thisMonday = getKstThisMonday();
  const weekOptions = [thisMonday, addDays(thisMonday, 7)];
  const params = await searchParams;
  const selectedWeek = weekOptions.includes(params.week ?? "")
    ? (params.week as string)
    : thisMonday;

  // 클럽 + 파트너 MD 동시 조회 (삭제 클럽 제외)
  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select(
      "id, name, area, partners:club_partners(md_id, user:users!club_partners_md_id_fkey(id, name, display_name, instagram))"
    )
    .is("deleted_at", null)
    .order("area", { ascending: true })
    .order("name", { ascending: true });

  // 선택 주차의 기존 조각 슬롯 조회
  const { data: slotsRaw } = await supabase
    .from("weekly_share_slots")
    .select(
      "id, club_id, md_id, week_start, md:users!weekly_share_slots_md_id_fkey(id, name, display_name, instagram)"
    )
    .eq("week_start", selectedWeek);

  const pickName = (
    name?: string | null,
    displayName?: string | null,
  ) => (name && name.trim()) || (displayName && displayName.trim()) || "이름없음";

  // 클럽별 파트너 MD 목록 정리 (중복 제거)
  // Supabase 조인 타입이 user/md를 배열로 추론하므로 unknown 경유 캐스팅
  const clubs: ClubRow[] = ((clubsRaw ?? []) as unknown as RawClub[]).map((c) => {
    const seen = new Set<string>();
    const partners: PartnerMd[] = [];
    for (const p of c.partners ?? []) {
      if (!p.user || seen.has(p.md_id)) continue;
      seen.add(p.md_id);
      partners.push({
        id: p.user.id,
        name: pickName(p.user.name, p.user.display_name),
        instagram: p.user.instagram,
      });
    }
    return { id: c.id, name: c.name, area: c.area, partners };
  });

  // 파트너 MD가 있는 클럽 우선 정렬 (배정 가능한 클럽을 위로).
  // 동순위는 안정 정렬로 DB의 area→name 순서가 보존됨.
  clubs.sort((a, b) => (b.partners.length > 0 ? 1 : 0) - (a.partners.length > 0 ? 1 : 0));

  type RawSlot = {
    id: string;
    club_id: string;
    md_id: string | null;
    md: { id: string; name: string | null; display_name: string | null; instagram: string | null } | null;
  };
  const slots: SlotRow[] = ((slotsRaw ?? []) as unknown as RawSlot[]).map((s) => ({
    id: s.id,
    club_id: s.club_id,
    md_id: s.md_id,
    md_name: s.md ? pickName(s.md.name, s.md.display_name) : null,
    md_instagram: s.md?.instagram ?? null,
  }));

  const slotByClub: Record<string, SlotRow> = {};
  for (const s of slots) slotByClub[s.club_id] = s;

  const weekLabel = (w: string) => {
    const idx = weekOptions.indexOf(w);
    const suffix = idx === 0 ? "이번 주" : idx === 1 ? "다음 주" : "";
    return `${w}${suffix ? ` (${suffix})` : ""}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-5xl mx-auto px-6 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </Link>
            <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
              <LayoutGrid className="w-3.5 h-3.5" />
              Share Slot Assign
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">조각 자리 배정</h1>
          <p className="text-neutral-500 font-medium">
            클럽별 조각 담당 MD를 미리 배정해요. 빈 자리는 그대로 두면 MD가 선착순으로 차지할 수 있어요.
          </p>
        </header>

        <AdminShareSlotManager
          clubs={clubs}
          slotByClub={slotByClub}
          selectedWeek={selectedWeek}
          weekOptions={weekOptions.map((w) => ({ value: w, label: weekLabel(w) }))}
        />
      </div>
    </div>
  );
}
