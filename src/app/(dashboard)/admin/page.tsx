import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  AlertCircle,
  Store,
  CheckCircle,
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
    supabase.from("auctions").select("*", { count: "exact", head: true }).in("status", ["won", "contacted", "confirmed"]),
    supabase.from("users").select("*", { count: "exact", head: true }).gt("strike_count", 0),
    supabase.from("clubs").select("*", { count: "exact", head: true }),
    supabase.from("clubs").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  // 시간 기반 필터: 종료 시간이 아직 안 지난 경매만 카운트
  const activeCount = (liveAuctions || []).filter((a) => {
    const end = a.extended_end_at || a.auction_end_at;
    return new Date(end) > new Date(now);
  }).length;

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
