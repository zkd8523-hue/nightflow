import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MousePointerClick, Instagram, MessageCircle, Copy, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { HotdealClicksTable } from "./HotdealClicksTable";

export const dynamic = "force-dynamic";

interface SummaryRow {
  slot_id: string;
  club_id: string;
  club_name: string | null;
  club_area: string | null;
  md_id: string | null;
  md_name: string | null;
  md_instagram: string | null;
  week_start: string;
  expires_at: string;
  instagram_clicks: number;
  openchat_clicks: number;
  copy_message_clicks: number;
  total_clicks: number;
  unique_users: number;
  unique_clickers: number;
  last_clicked_at: string | null;
}

interface RawClick {
  slot_id: string;
  user_id: string | null;
  click_type: string;
  clicked_at: string;
  users: { display_name: string | null; name: string | null; instagram: string | null } | { display_name: string | null; name: string | null; instagram: string | null }[] | null;
}

interface SlotClicker {
  userId: string;
  name: string;
  instagram: string | null;
  types: Set<string>;
  count: number;
  lastClickedAt: string;
}

// 클라이언트로 넘길 직렬화 가능한 형태 (Set → string[])
export interface SlotClickerSerial {
  userId: string;
  name: string;
  instagram: string | null;
  types: string[];
  count: number;
  lastClickedAt: string;
}

function getKstThisMonday(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay(); // 0=일~6=토
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  return monday.toISOString().slice(0, 10);
}


export default async function AdminHotdealClicksPage({
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

  const params = await searchParams;
  const thisMonday = getKstThisMonday();
  const selectedWeek = params.week || thisMonday;

  // 주차 옵션: 이번주 + 지난 8주
  const { data: weeksData } = await supabase
    .from("weekly_hotdeal_slots")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(200);
  const allWeeks = Array.from(new Set((weeksData ?? []).map((w) => w.week_start as string))).slice(0, 12);
  if (!allWeeks.includes(selectedWeek)) allWeeks.unshift(selectedWeek);

  // 선택 주차 슬롯 클릭 집계
  const { data: rowsData } = await supabase
    .from("hotdeal_slot_click_summary")
    .select("*")
    .eq("week_start", selectedWeek)
    .order("total_clicks", { ascending: false });

  const rows = (rowsData ?? []) as SummaryRow[];

  // 슬롯별 클릭 유저 상세 (행 펼침용) — 로그인 유저만 신원 표시, 비로그인은 익명 집계
  const slotIds = rows.map((r) => r.slot_id);
  const clickersBySlot: Record<string, SlotClicker[]> = {};
  let anonBySlot: Record<string, number> = {};
  if (slotIds.length > 0) {
    const { data: clickRows } = await supabase
      .from("hotdeal_slot_contact_clicks")
      .select("slot_id, user_id, click_type, clicked_at, users:user_id(display_name, name, instagram)")
      .in("slot_id", slotIds)
      .order("clicked_at", { ascending: false });

    // 유저별로 집계: 마지막 클릭 시각 + 클릭 타입 모음
    const agg: Record<string, Record<string, SlotClicker>> = {};
    const anon: Record<string, number> = {};
    for (const c of (clickRows ?? []) as unknown as RawClick[]) {
      if (!c.user_id) {
        anon[c.slot_id] = (anon[c.slot_id] ?? 0) + 1;
        continue;
      }
      const bySlot = (agg[c.slot_id] ??= {});
      const u = Array.isArray(c.users) ? c.users[0] : c.users;
      const existing = bySlot[c.user_id];
      if (existing) {
        existing.types.add(c.click_type);
        existing.count += 1;
      } else {
        bySlot[c.user_id] = {
          userId: c.user_id,
          name: u?.display_name || u?.name || "유저",
          instagram: u?.instagram ?? null,
          types: new Set([c.click_type]),
          count: 1,
          lastClickedAt: c.clicked_at, // 정렬 desc라 첫 등장이 가장 최근
        };
      }
    }
    for (const sid of Object.keys(agg)) {
      clickersBySlot[sid] = Object.values(agg[sid]);
    }
    anonBySlot = anon;
  }

  // Set → 배열로 직렬화 (클라이언트 컴포넌트 전달용), 최근 클릭순 정렬
  const clickersSerial: Record<string, SlotClickerSerial[]> = {};
  for (const sid of Object.keys(clickersBySlot)) {
    clickersSerial[sid] = clickersBySlot[sid]
      .map((c) => ({
        userId: c.userId,
        name: c.name,
        instagram: c.instagram,
        types: Array.from(c.types),
        count: c.count,
        lastClickedAt: c.lastClickedAt,
      }))
      .sort((a, b) => b.lastClickedAt.localeCompare(a.lastClickedAt));
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.instagram += Number(r.instagram_clicks || 0);
      acc.openchat += Number(r.openchat_clicks || 0);
      acc.copy += Number(r.copy_message_clicks || 0);
      acc.total += Number(r.total_clicks || 0);
      acc.uniqueUsers += Number(r.unique_users || 0);
      return acc;
    },
    { instagram: 0, openchat: 0, copy: 0, total: 0, uniqueUsers: 0 }
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-neutral-400" />
              </Link>
              <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
                <MousePointerClick className="w-3.5 h-3.5" />
                Guest Sign Clicks
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter">게스트 간판 클릭 현황</h1>
            <p className="text-neutral-500 font-medium">
              클럽 상세에서 인스타/오픈채팅/문의 메시지 복사 버튼이 눌린 횟수 (슬롯 × 주차 단위)
            </p>
          </div>

          <form className="flex items-center gap-2">
            <label className="text-neutral-500 text-[11px] font-bold uppercase tracking-wider">주차</label>
            <select
              name="week"
              defaultValue={selectedWeek}
              className="bg-[#1C1C1E] border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm"
            >
              {allWeeks.map((w) => (
                <option key={w} value={w}>
                  {w} {w === thisMonday ? "(이번 주)" : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-white text-black font-bold text-sm rounded-lg px-4 py-2"
            >
              조회
            </button>
          </form>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-[#1C1C1E] border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-neutral-500">
              <MousePointerClick className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">총 클릭</span>
            </div>
            <span className="text-3xl font-black text-white">{totals.total.toLocaleString()}</span>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-sky-400">
              <Users className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">유니크 유저</span>
            </div>
            <span className="text-3xl font-black text-sky-300">{totals.uniqueUsers.toLocaleString()}</span>
            <span className="text-[10px] text-neutral-500 mt-1 block">로그인 유저 기준 디스팅트</span>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-pink-400">
              <Instagram className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">인스타</span>
            </div>
            <span className="text-3xl font-black text-pink-300">{totals.instagram.toLocaleString()}</span>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-green-400">
              <MessageCircle className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">오픈채팅</span>
            </div>
            <span className="text-3xl font-black text-green-300">{totals.openchat.toLocaleString()}</span>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <Copy className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">문의 복사</span>
            </div>
            <span className="text-3xl font-black text-amber-300">{totals.copy.toLocaleString()}</span>
          </Card>
        </div>

        <Card className="bg-[#1C1C1E] border-neutral-800 overflow-hidden">
          <HotdealClicksTable
            rows={rows}
            clickersBySlot={clickersSerial}
            anonBySlot={anonBySlot}
          />
        </Card>
      </div>
    </div>
  );
}
