import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AdminDashboardGrid } from "@/components/admin/AdminDashboardGrid";
import {
  Users,
  TrendingUp,
  AlertCircle,
  Store,
  Flag,
  ShieldAlert,
  Sparkles,
  Ban,
  Megaphone,
  CalendarCheck,
  LayoutGrid,
  Star,
  MessageSquareWarning,
  BarChart3,
  Wine,
  Globe,
  Landmark,
  Ticket,
  PartyPopper,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    // 헤더 없으면 직접 재검증 (미들웨어 우회 등 예외 상황)
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    const { data: adminUser } = await supabase.from("users").select("role").eq("id", authUser.id).single();
    if (!adminUser || adminUser.role !== "admin") redirect("/");
  }

  const now = new Date().toISOString();

  // 통계 데이터 수집
  const [
    { count: totalUsers },
    { count: totalMDs },
    { count: pendingMDs },
    { count: totalAuctions },
    { data: liveAuctions },
    { count: strikeUsers },
    { count: totalClubs },
    { count: pendingAppeals },
    { count: flagTotal },
    { count: flagActive },
    { count: shareTotal },
    { count: shareActive },
    { count: marketingConsented },
    { count: foreignNew },
    { count: pendingBankCredits },
    { count: pendingWordReports },
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
    supabase.from("users").select("*", { count: "exact", head: true }).gt("strike_count", 0),
    supabase.from("clubs").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("penalty_appeals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("puzzles").select("*", { count: "exact", head: true }).eq("is_recruiting_party", false),
    supabase.from("puzzles").select("*", { count: "exact", head: true }).eq("is_recruiting_party", false).eq("status", "open"),
    supabase.from("puzzles").select("*", { count: "exact", head: true }).eq("is_recruiting_party", true),
    supabase.from("puzzles").select("*", { count: "exact", head: true }).eq("is_recruiting_party", true).eq("status", "open"),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("alimtalk_consent", true)
      .is("deleted_at", null)
      .neq("role", "admin"),
    // 외국인 컨시어지 신규 요청 (빨간 dot 배지용)
    supabase.from("foreign_requests").select("*", { count: "exact", head: true }).eq("status", "new"),
    // 계좌이체 크레딧 입금확인 대기
    supabase.from("credit_payments").select("*", { count: "exact", head: true }).eq("method", "bank_transfer").eq("status", "pending"),
    // 5자 리뷰 단어 신고 미처리
    supabase.from("club_word_cloud_reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
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

  // 방문 리뷰 검토 대기 수 — 신규 pending(491) + 삭제 요청(492) 합산
  const [{ count: pendingNewReviewCount }, { count: reviewDeletionCount }] = await Promise.all([
    supabase
      .from("puzzle_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("source", "visit"),
    supabase
      .from("puzzle_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .not("delete_requested_at", "is", null),
  ]);
  const pendingVisitReviewCount = (pendingNewReviewCount ?? 0) + (reviewDeletionCount ?? 0);

  // 설문 응답 수 — 트리거별 분리 (직접 취소 vs 노매치=선택 만료), 최근 7일 배지용
  const survey7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { count: cancelSurveyTotal },
    { count: cancelSurveyRecent },
    { count: nomatchSurveyTotal },
    { count: nomatchSurveyRecent },
  ] = await Promise.all([
    supabase.from("puzzle_cancellation_surveys").select("id", { count: "exact", head: true })
      .eq("trigger_type", "self_cancelled"),
    supabase.from("puzzle_cancellation_surveys").select("id", { count: "exact", head: true })
      .eq("trigger_type", "self_cancelled").gte("responded_at", survey7d),
    supabase.from("puzzle_cancellation_surveys").select("id", { count: "exact", head: true })
      .eq("trigger_type", "selecting_expired"),
    supabase.from("puzzle_cancellation_surveys").select("id", { count: "exact", head: true })
      .eq("trigger_type", "selecting_expired").gte("responded_at", survey7d),
  ]);

  // 클럽 요청 (영업 리드) — 최근 7일
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // 미등록 클럽 위시(club_requests) + 등록 클럽 선호 지정(puzzles.preferred_club_ids, Mig 504)을 합산.
  // 위시만 세면 선호 클럽 수요가 쌓여도 카드가 "0건"으로 보여서 영업 리드가 있는 줄 모름.
  const [
    { count: totalClubRequests },
    { count: recentClubRequests },
    { count: totalPreferredFlags },
    { count: recentPreferredFlags },
  ] = await Promise.all([
    supabase.from("club_requests").select("id", { count: "exact", head: true }),
    supabase
      .from("club_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("puzzles")
      .select("id", { count: "exact", head: true })
      .neq("preferred_club_ids", "{}"),
    supabase
      .from("puzzles")
      .select("id", { count: "exact", head: true })
      .neq("preferred_club_ids", "{}")
      .gte("created_at", sevenDaysAgo),
  ]);
  const clubLeadTotal = (totalClubRequests || 0) + (totalPreferredFlags || 0);
  const clubLeadRecent = (recentClubRequests || 0) + (recentPreferredFlags || 0);

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
      label: "파트너 관리",
      value: `${totalMDs || 0}명`,
      icon: Store,
      color: "text-money",
      bgColor: "bg-green-500/10",
      badge: pendingMDs ? `${pendingMDs}명 대기` : null,
      href: "/admin/mds",
    },
    {
      label: "등록 클럽",
      value: `${totalClubs || 0}곳`,
      icon: Store,
      color: "text-brand-amber",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/clubs",
    },
    {
      label: "주류 정보 관리",
      value: "관리",
      icon: Wine,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      badge: null,
      href: "/admin/liquor-products",
    },
    {
      label: "깃발 현황",
      value: `${flagTotal || 0}건`,
      icon: Flag,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      badge: flagActive ? `${flagActive}건 모집 중` : null,
      href: "/admin/puzzles?kind=flag",
    },
    {
      label: "파티 현황",
      value: `${shareTotal || 0}건`,
      icon: LayoutGrid,
      color: "text-money",
      bgColor: "bg-green-500/10",
      badge: shareActive ? `${shareActive}건 모집 중` : null,
      href: "/admin/puzzles?kind=share",
    },
    {
      label: "외국인 요청",
      value: `${foreignNew || 0}건 신규`,
      icon: Globe,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      badge: foreignNew ? `🔴 ${foreignNew}건 대기` : null,
      href: "/admin/foreign",
    },
    {
      label: "크레딧 입금확인",
      value: pendingBankCredits ? `${pendingBankCredits}건 대기` : "관리",
      icon: Landmark,
      color: "text-brand-amber",
      bgColor: "bg-amber-500/10",
      badge: pendingBankCredits ? `🔴 ${pendingBankCredits}건 대기` : null,
      href: "/admin/credits",
    },
    {
      label: "게스트 간판 배정",
      value: "관리",
      icon: CalendarCheck,
      color: "text-brand-amber",
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
      color: "text-brand-amber",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/marketing",
    },
    {
      label: "앱 피드백",
      value: "보기",
      icon: Star,
      color: "text-brand-amber",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/feedback",
    },
    {
      label: "방문 리뷰 검토",
      value: `${pendingVisitReviewCount || 0}건`,
      icon: Star,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: pendingVisitReviewCount ? `${pendingVisitReviewCount}건 대기` : null,
      href: "/admin/visit-reviews",
    },
    {
      label: "파티 리뷰 집계",
      value: "보기",
      icon: Star,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: null,
      href: "/admin/party-reviews",
    },
    {
      label: "쿠폰 통계",
      value: "퍼널 분석",
      icon: Ticket,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      badge: "발행→받음→사용",
      href: "/admin/coupons",
    },
    {
      label: "파티 통계",
      value: "퍼널 분석",
      icon: PartyPopper,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      badge: "발행→참여→성사",
      href: "/admin/parties",
    },
    {
      label: "이탈·전환 인사이트",
      value: "퍼널 분석",
      icon: BarChart3,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      badge: "최근 7일",
      href: "/admin/insights",
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
      color: "text-brand-amber",
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
      label: "취소 설문",
      value: `${cancelSurveyTotal || 0}건`,
      icon: MessageSquareWarning,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      badge: cancelSurveyRecent ? `최근 7일 ${cancelSurveyRecent}건` : null,
      href: "/admin/puzzles?tab=surveys&trigger=self_cancelled",
    },
    {
      label: "노매치 사유",
      value: `${nomatchSurveyTotal || 0}건`,
      icon: MessageSquareWarning,
      color: "text-rose-400",
      bgColor: "bg-rose-500/10",
      badge: nomatchSurveyRecent ? `최근 7일 ${nomatchSurveyRecent}건` : null,
      href: "/admin/puzzles?tab=surveys&trigger=selecting_expired",
    },
    {
      label: "클럽 요청 (영업 리드)",
      value: `${clubLeadTotal}건`,
      icon: Sparkles,
      color: "text-brand-amber",
      bgColor: "bg-amber-500/10",
      badge: clubLeadRecent ? `최근 7일 ${clubLeadRecent}건` : null,
      href: "/admin/club-requests",
    },
    {
      label: "5자리뷰 현황",
      value: pendingWordReports ? `신고 ${pendingWordReports}건` : "보기",
      icon: Star,
      color: pendingWordReports ? "text-red-400" : "text-brand-amber",
      bgColor: pendingWordReports ? "bg-red-500/10" : "bg-amber-500/10",
      badge: pendingWordReports ? `${pendingWordReports}건 대기` : null,
      href: "/admin/reviews",
    },
    {
      label: "사용자 차단",
      value: `${totalUserBlocks || 0}건`,
      icon: Ban,
      color: dangerUserCount > 0 ? "text-red-500" : "text-muted-foreground",
      bgColor: dangerUserCount > 0 ? "bg-red-500/10" : "bg-muted/10",
      badge: dangerUserCount > 0
        ? `⚠ 3회+ ${dangerUserCount}명`
        : recentUserBlocks
        ? `24h ${recentUserBlocks}건`
        : null,
      href: "/admin/user-blocks",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            ← 홈으로
          </Link>
          <h1 className="text-4xl font-black text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">NightFlow 플랫폼 관리</p>
        </div>

        {/* 지역별 현황 (접이식) */}
        <details className="group mb-8 bg-card border border-border rounded-2xl overflow-hidden">
          <summary className="flex items-center justify-between px-5 py-3.5 cursor-pointer list-none hover:bg-card/50 transition-colors">
            <h2 className="text-base font-black text-foreground">지역별 현황</h2>
            <span className="text-muted-foreground text-sm font-bold group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="border-t border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground font-bold">지역</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-bold">클럽</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-bold">파트너</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-bold">경매</th>
                  <th className="text-right px-5 py-3 text-muted-foreground font-bold">평균 입찰</th>
                  <th className="text-right px-5 py-3 text-muted-foreground font-bold">평균 관심</th>
                </tr>
              </thead>
              <tbody>
                {areaStats.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">데이터 없음</td></tr>
                ) : areaStats.map((s, i) => (
                  <tr key={s.area} className={i < areaStats.length - 1 ? "border-b border-border/50" : ""}>
                    <td className="px-5 py-3.5 font-bold text-foreground">{s.area}</td>
                    <td className="px-4 py-3.5 text-right text-foreground/80">{s.clubs}</td>
                    <td className="px-4 py-3.5 text-right text-foreground/80">{s.mds}</td>
                    <td className="px-4 py-3.5 text-right text-foreground/80">{s.auctions}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-brand-amber">{s.avgBids}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-money">{s.avgInterest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* 통계 카드 — 꾹눌러 순서변경 + 숨기기 (클라이언트, localStorage 저장) */}
        <AdminDashboardGrid
          stats={stats.map((s) => {
            const icon = s.icon as { displayName?: string; name?: string };
            return {
              id: s.label,
              label: s.label,
              value: s.value,
              iconName: icon.displayName ?? icon.name ?? "Sparkles",
              color: s.color,
              bgColor: s.bgColor,
              badge: (s as { badge?: string | null }).badge ?? null,
              href: s.href,
            };
          })}
        />
      </div>
    </div>
  );
}
