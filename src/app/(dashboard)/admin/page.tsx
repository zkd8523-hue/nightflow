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
  ShieldAlert,
  Sparkles,
  Ban,
  Megaphone,
  CalendarCheck,
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
    { count: pendingAppeals },
    { count: totalPuzzles },
    { count: activePuzzles },
    { count: marketingConsented },
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
    supabase.from("clubs").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("penalty_appeals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("puzzles").select("*", { count: "exact", head: true }),
    supabase.from("puzzles").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("alimtalk_consent", true)
      .is("deleted_at", null)
      .neq("role", "admin"),
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
    .eq("status", "approved")
    .is("deleted_at", null);

  // 지역별 집계
  type AreaStat = { clubs: number; mds: number; auctions: number; totalBids: number; totalInterest: number };
  const areaMap: Record<string, AreaStat> = {};

  const ensureArea = (area: string) => {
    if (!areaMap[area]) areaMap[area] = { clubs: 0, mds: 0, auctions: 0, totalBids: 0, totalInterest: 0 };
  };

  (clubsRaw || []).forEach((c) => { if (c.area) { ensureArea(c.area); areaMap[c.area].clubs++; } });
  (mdsRaw || []).forEach((m) => {
    const areas: string[] = Array.isArray(m.area) ? m.area : m.area ? [m.area] : [];
    areas.forEach(a => { ensureArea(a); areaMap[a].mds++; });
  });

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

  // 신고 수 조회 (미처리만) — 경매 + 깃발 합산
  const [{ count: pendingAuctionReportCount }, { count: pendingPuzzleReportCount }] = await Promise.all([
    supabase
      .from("auction_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("puzzle_content_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  const pendingReportCount = (pendingAuctionReportCount || 0) + (pendingPuzzleReportCount || 0);

  // 연락 미수신 신고 큐 (visit_result=noshow, strike 미처리)
  const { count: pendingPuzzleNoshowCount } = await supabase
    .from("puzzle_offers")
    .select("id", { count: "exact", head: true })
    .eq("visit_result", "noshow")
    .is("strike_applied_at", null);

  // 클럽 요청 (영업 리드) — 최근 7일
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: totalClubRequests }, { count: recentClubRequests }] = await Promise.all([
    supabase.from("club_requests").select("id", { count: "exact", head: true }),
    supabase
      .from("club_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
  ]);

  // 사용자 차단 통계 (Apple Guideline 1.2 대응)
  const [
    { count: totalUserBlocks },
    { count: recentUserBlocks },
    { data: blockedTargets },
  ] = await Promise.all([
    supabase.from("user_blocks").select("id", { count: "exact", head: true }),
    supabase
      .from("user_blocks")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo),
    supabase.from("user_blocks").select("blocked_id"),
  ]);

  // 3회 이상 차단당한 사용자 수
  const blockCountMap = new Map<string, number>();
  (blockedTargets || []).forEach((b) => {
    blockCountMap.set(b.blocked_id, (blockCountMap.get(b.blocked_id) || 0) + 1);
  });
  const dangerUserCount = Array.from(blockCountMap.values()).filter((c) => c >= 3).length;

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
      label: "등록 클럽",
      value: `${totalClubs || 0}곳`,
      icon: Store,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/clubs",
    },
    {
      label: "깃발 현황",
      value: `${totalPuzzles || 0}건`,
      icon: Flag,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      badge: activePuzzles ? `${activePuzzles}건 모집 중` : null,
      href: "/admin/puzzles",
    },
    {
      label: "퍼즐 매칭",
      value: `${wonAuctions || 0}건`,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      href: "/admin/auctions",
    },
    {
      label: "게스트 간판 배정",
      value: "관리",
      icon: CalendarCheck,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/hotdeal-slots",
    },
    {
      label: "게스트 간판 클릭",
      value: "보기",
      icon: Megaphone,
      color: "text-pink-400",
      bgColor: "bg-pink-500/10",
      badge: null,
      href: "/admin/hotdeal-clicks",
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
      label: "마케팅 수신 동의",
      value: `${marketingConsented || 0}명`,
      icon: Megaphone,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/marketing",
    },
    {
      label: "미처리 신고",
      value: `${pendingReportCount}건`,
      icon: Flag,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      badge: pendingReportCount
        ? `경매 ${pendingAuctionReportCount || 0} / 깃발 ${pendingPuzzleReportCount || 0}`
        : null,
      href: "/admin/reports",
    },
    {
      label: "이의제기",
      value: `${pendingAppeals || 0}건`,
      icon: AlertCircle,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      badge: pendingAppeals ? `${pendingAppeals}건 대기` : null,
      href: "/admin/appeals",
    },
    {
      label: "연락 미수신 신고",
      value: `${pendingPuzzleNoshowCount || 0}건`,
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      badge: pendingPuzzleNoshowCount ? `${pendingPuzzleNoshowCount}건 대기` : null,
      href: "/admin/puzzle-noshow-reports",
    },
    {
      label: "어뷰징 조사",
      value: "깃발 패턴",
      icon: ShieldAlert,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      badge: null,
      href: "/admin/abuse",
    },
    {
      label: "클럽 요청 (영업 리드)",
      value: `${totalClubRequests || 0}건`,
      icon: Sparkles,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: recentClubRequests ? `최근 7일 ${recentClubRequests}건` : null,
      href: "/admin/club-requests",
    },
    {
      label: "사용자 차단",
      value: `${totalUserBlocks || 0}건`,
      icon: Ban,
      color: dangerUserCount > 0 ? "text-red-500" : "text-neutral-400",
      bgColor: dangerUserCount > 0 ? "bg-red-500/10" : "bg-neutral-500/10",
      badge: dangerUserCount > 0
        ? `⚠ 3회+ ${dangerUserCount}명`
        : recentUserBlocks
        ? `24h ${recentUserBlocks}건`
        : null,
      href: "/admin/user-blocks",
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

        {/* 지역별 현황 (접이식) */}
        <details className="group mb-8 bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
          <summary className="flex items-center justify-between px-5 py-3.5 cursor-pointer list-none hover:bg-neutral-900/50 transition-colors">
            <h2 className="text-base font-black text-white">지역별 현황</h2>
            <span className="text-neutral-500 text-sm font-bold group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="border-t border-neutral-800 overflow-x-auto">
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
        </details>

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
