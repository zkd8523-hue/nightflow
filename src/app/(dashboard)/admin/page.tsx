import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  AlertCircle,
  Store,
  CheckCircle,
  Flag,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: adminUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!adminUser || adminUser.role !== "admin") {
    redirect("/");
  }

  const now = new Date().toISOString();

  // 통계 데이터 수집
  const [
    { count: totalUsers },
    { count: totalMDs },
    { count: pendingMDs },
    { count: totalAuctions },
    { data: liveAuctions },
    { count: wonAuctions },
    { count: strikeUsers },
    { count: totalClubs },
    { count: pendingClubs },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "user"),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "md"),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("md_status", "pending"),
    supabase.from("auctions").select("*", { count: "exact", head: true }),
    // 시간 기반 진행중 카운트: status가 active/scheduled이고 시작 <= now < 종료
    supabase
      .from("auctions")
      .select("id, auction_end_at, extended_end_at")
      .in("status", ["active", "scheduled"])
      .lte("auction_start_at", now),
    supabase.from("auctions").select("*", { count: "exact", head: true }).in("status", ["won", "confirmed"]),
    supabase.from("users").select("*", { count: "exact", head: true }).gt("strike_count", 0),
    supabase.from("clubs").select("*", { count: "exact", head: true }),
    supabase.from("clubs").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  // 시간 기반 필터: 종료 시간이 아직 안 지난 경매만 카운트
  const activeCount = (liveAuctions || []).filter((a) => {
    const end = a.extended_end_at || a.auction_end_at;
    return new Date(end) > new Date(now);
  }).length;

  // 지역별 통계: clubs.area 기준 집계
  const { data: areaRaw } = await supabase
    .from("auctions")
    .select("id, chat_interest_count, club:clubs(area)");

  const { data: bidsRaw } = await supabase
    .from("bids")
    .select("auction_id");

  const { data: mdsRaw } = await supabase
    .from("users")
    .select("area")
    .eq("role", "md")
    .eq("md_status", "approved");

  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select("area")
    .eq("status", "approved");

  // 지역별 집계
  type AreaStat = { clubs: number; mds: number; auctions: number; totalBids: number; totalInterest: number };
  const areaMap: Record<string, AreaStat> = {};

  const ensureArea = (area: string) => {
    if (!areaMap[area]) areaMap[area] = { clubs: 0, mds: 0, auctions: 0, totalBids: 0, totalInterest: 0 };
  };

  (clubsRaw || []).forEach((c) => { if (c.area) { ensureArea(c.area); areaMap[c.area].clubs++; } });
  (mdsRaw || []).forEach((m) => { if (m.area) { ensureArea(m.area); areaMap[m.area].mds++; } });

  const bidCountMap: Record<string, number> = {};
  (bidsRaw || []).forEach((b) => { bidCountMap[b.auction_id] = (bidCountMap[b.auction_id] || 0) + 1; });

  (areaRaw || []).forEach((a) => {
    const area = (a.club as unknown as { area: string } | null)?.area;
    if (!area) return;
    ensureArea(area);
    areaMap[area].auctions++;
    areaMap[area].totalBids += bidCountMap[a.id] || 0;
    areaMap[area].totalInterest += a.chat_interest_count || 0;
  });

  const areaStats = Object.entries(areaMap)
    .map(([area, s]) => ({
      area,
      clubs: s.clubs,
      mds: s.mds,
      auctions: s.auctions,
      avgBids: s.auctions > 0 ? (s.totalBids / s.auctions).toFixed(1) : "0",
      avgInterest: s.auctions > 0 ? (s.totalInterest / s.auctions).toFixed(1) : "0",
    }))
    .sort((a, b) => b.auctions - a.auctions);

  // 신고 수 조회 (미처리만)
  const { count: pendingReportCount } = await supabase
    .from("auction_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const stats = [
    {
      label: "전체 유저",
      value: `${totalUsers || 0}명`,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      href: "/admin/users",
    },
    {
      label: "MD 관리",
      value: `${totalMDs || 0}명`,
      icon: Store,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      badge: pendingMDs ? `${pendingMDs}명 대기` : null,
      href: "/admin/mds",
    },
    {
      label: "총 경매",
      value: `${totalAuctions || 0}건`,
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      badge: activeCount ? `${activeCount}건 진행중` : null,
      href: "/admin/auctions",
    },
    {
      label: "등록 클럽",
      value: `${totalClubs || 0}곳`,
      icon: Store,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      badge: pendingClubs ? `${pendingClubs}곳 대기` : null,
      href: "/admin/clubs",
    },
    {
      label: "낙찰",
      value: `${wonAuctions || 0}건`,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      href: "/admin/auctions",
    },
    {
      label: "스트라이크 유저",
      value: `${strikeUsers || 0}명`,
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      href: "/admin/users",
    },
    {
      label: "미처리 신고",
      value: `${pendingReportCount || 0}건`,
      icon: Flag,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      badge: pendingReportCount ? `${pendingReportCount}건 대기` : null,
      href: "/admin/reports",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-white transition-colors mb-4"
          >
            ← 홈으로
          </Link>
          <h1 className="text-4xl font-black text-white mb-2">Admin Dashboard</h1>
          <p className="text-neutral-500">NightFlow 플랫폼 관리</p>
        </div>

        {/* 지역별 현황 */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-white mb-3">지역별 현황</h2>
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-5 py-3 text-neutral-500 font-bold">지역</th>
                  <th className="text-right px-4 py-3 text-neutral-500 font-bold">클럽</th>
                  <th className="text-right px-4 py-3 text-neutral-500 font-bold">MD</th>
                  <th className="text-right px-4 py-3 text-neutral-500 font-bold">경매</th>
                  <th className="text-right px-5 py-3 text-neutral-500 font-bold">평균 입찰</th>
                  <th className="text-right px-5 py-3 text-neutral-500 font-bold">평균 관심</th>
                </tr>
              </thead>
              <tbody>
                {areaStats.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-neutral-600">데이터 없음</td></tr>
                ) : areaStats.map((s, i) => (
                  <tr key={s.area} className={i < areaStats.length - 1 ? "border-b border-neutral-800/50" : ""}>
                    <td className="px-5 py-3.5 font-bold text-white">{s.area}</td>
                    <td className="px-4 py-3.5 text-right text-neutral-300">{s.clubs}</td>
                    <td className="px-4 py-3.5 text-right text-neutral-300">{s.mds}</td>
                    <td className="px-4 py-3.5 text-right text-neutral-300">{s.auctions}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-amber-400">{s.avgBids}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-green-400">{s.avgInterest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href}>
              <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 hover:border-neutral-600 hover:bg-neutral-900/50 transition-all group cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div className={`${stat.bgColor} p-2 rounded-xl group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  {stat.badge && (
                    <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-500 rounded-full font-bold">
                      {stat.badge}
                    </span>
                  )}
                </div>
                <p className="text-neutral-500 text-sm font-bold mb-1">{stat.label}</p>
                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
