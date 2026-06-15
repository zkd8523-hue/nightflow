import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShareSlotBoard } from "@/components/md/ShareSlotBoard";
import { ShareOptionManager } from "@/components/md/ShareOptionManager";
import { ShareWeekdayPlanBoard } from "@/components/md/ShareWeekdayPlanBoard";
import type { ShareOption, ShareWeekdayPlan } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "조각 자리 선점 — NightFlow",
};

function weekStartKst(d: Date): string {
  // KST 기준 그 주의 월요일 ISO (YYYY-MM-DD)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dow = kst.getUTCDay(); // 0=일~6=토
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export default async function MDShareSlotsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role, kakao_open_chat_url")
    .eq("id", user.id)
    .single();
  if (!userRow || (userRow.role !== "md" && userRow.role !== "admin")) {
    redirect("/");
  }

  // 오픈채팅 미등록 여부 — 등록돼 있으면 배너 안 띄움 (비었을 때만 경고)
  const missingOpenChat = !(userRow.kakao_open_chat_url ?? "").trim();

  const { data: partnerClubs } = await supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, floor_plan_url, floor_plan_urls, club_partners!inner(md_id)")
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .order("name");

  // 비프로덕션 + admin: 운영자 테스트 클럽 추가 노출
  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const showTestClubs = !isProd && userRow.role === "admin";
  const clubs = partnerClubs ?? [];
  if (showTestClubs) {
    const { data: testClubs } = await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, floor_plan_url, floor_plan_urls")
      .ilike("name", "%운영자%")
      .is("deleted_at", null);
    const existing = new Set(clubs.map((c) => c.id));
    for (const tc of testClubs ?? []) {
      if (!existing.has(tc.id)) {
        clubs.push({ ...tc, club_partners: [] } as typeof clubs[number]);
      }
    }
  }

  const thisWeek = weekStartKst(new Date());
  const clubIds = clubs.map((c) => c.id);

  // 이번 주 슬롯 조회 (본인 + 다른 MD 모두 — 점유 상태 표시용)
  const { data: slots } = clubIds.length
    ? await supabase
        .from("weekly_share_slots")
        .select("id, club_id, md_id, week_start, expires_at")
        .in("club_id", clubIds)
        .eq("week_start", thisWeek)
    : { data: [] };

  // 내가 이번 주 선점 중인 클럽 (옵션/요일표를 보여줄 대상)
  const myClaimedClubIds = (slots ?? [])
    .filter((s) => s.md_id === user.id)
    .map((s) => s.club_id);

  // 내 조각 옵션 + 요일표 (선점 클럽만)
  const { data: optionRows } = myClaimedClubIds.length
    ? await supabase
        .from("share_options")
        .select("*")
        .eq("md_id", user.id)
        .in("club_id", myClaimedClubIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] };
  const { data: planRows } = myClaimedClubIds.length
    ? await supabase
        .from("share_weekday_plan")
        .select("*")
        .eq("md_id", user.id)
        .in("club_id", myClaimedClubIds)
    : { data: [] };

  const options = (optionRows ?? []) as ShareOption[];
  const plans = (planRows ?? []) as ShareWeekdayPlan[];
  // 클럽 대표 테이블맵 1장 (다중 등록 시 첫 장, 없으면 레거시 단일)
  const clubFloorPlan = (id: string): string | null => {
    const c = clubs.find((cl) => cl.id === id) as
      | { floor_plan_url?: string | null; floor_plan_urls?: string[] | null }
      | undefined;
    return c?.floor_plan_urls?.[0] ?? c?.floor_plan_url ?? null;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {missingOpenChat && (
          <Link
            href="/profile"
            className="block bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4"
          >
            <p className="text-[13px] font-bold text-amber-400">
              ⚠️ 조각을 올리려면 먼저 오픈채팅을 등록해주세요
            </p>
            <p className="text-[12px] text-neutral-400 mt-1 leading-relaxed">
              유저는 오픈채팅으로 안내받아요. 등록 전까지는 조각이 자동으로 올라가지 않아요.
            </p>
            <p className="text-[12px] font-bold text-white mt-2">프로필 설정하러 가기 →</p>
          </Link>
        )}

        <ShareSlotBoard
          currentUserId={user.id}
          clubs={clubs.map((c) => ({
            id: c.id,
            name: c.name,
            area: c.area,
            thumbnail_url: c.thumbnail_url,
          }))}
          slots={(slots ?? []).map((s) => ({
            id: s.id,
            club_id: s.club_id,
            md_id: s.md_id,
            week_start: s.week_start,
            expires_at: s.expires_at,
          }))}
          thisWeekISO={thisWeek}
          embedded
          isAdmin={userRow.role === "admin"}
        />

        {/* 선점 중인 클럽별 옵션 + 요일표 */}
        {myClaimedClubIds.map((cid) => (
          <div key={cid} className="bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-4 space-y-5">
            <ShareOptionManager
              clubId={cid}
              options={options.filter((o) => o.club_id === cid)}
              floorPlanUrl={clubFloorPlan(cid)}
            />
            <div className="border-t border-neutral-800" />
            <ShareWeekdayPlanBoard
              clubId={cid}
              options={options.filter((o) => o.club_id === cid)}
              plans={plans.filter((p) => p.club_id === cid)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
