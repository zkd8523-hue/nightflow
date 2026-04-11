import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, AlertTriangle, Flag } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

const REASON_LABELS: Record<string, string> = {
  fake_listing: "허위매물",
  scam_suspect: "사기 의심",
  other: "기타",
};

export default async function AdminReportsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  // 신고 목록 조회 (최신순)
  const { data: reports } = await supabase
    .from("auction_reports")
    .select(`
      id,
      reason,
      memo,
      created_at,
      auction_id,
      reporter_id
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  // 관련 경매/유저 정보 조회
  const auctionIds = [...new Set(reports?.map(r => r.auction_id) || [])];
  const reporterIds = [...new Set(reports?.map(r => r.reporter_id) || [])];

  const { data: auctions } = auctionIds.length > 0
    ? await supabase
        .from("auctions")
        .select("id, title, club:clubs(name), md:users!auctions_md_id_fkey(name)")
        .in("id", auctionIds)
    : { data: [] };

  const { data: reporters } = reporterIds.length > 0
    ? await supabase
        .from("users")
        .select("id, name")
        .in("id", reporterIds)
    : { data: [] };

  const auctionMap = new Map((auctions || []).map(a => [a.id, a]));
  const reporterMap = new Map((reporters || []).map(u => [u.id, u]));

  // 경매별 신고 수 집계
  const countByAuction = (reports || []).reduce((acc, r) => {
    acc[r.auction_id] = (acc[r.auction_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">신고 관리</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              총 {reports?.length || 0}건의 신고
            </p>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
            <p className="text-2xl font-black text-white">{reports?.length || 0}</p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">전체 신고</p>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
            <p className="text-2xl font-black text-red-400">
              {(reports || []).filter(r => r.reason === "fake_listing").length}
            </p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">허위매물</p>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
            <p className="text-2xl font-black text-amber-400">
              {Object.keys(countByAuction).length}
            </p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">신고된 경매</p>
          </Card>
        </div>

        {/* 신고 목록 */}
        {(!reports || reports.length === 0) ? (
          <div className="text-center py-16 space-y-3">
            <Flag className="w-10 h-10 text-neutral-700 mx-auto" />
            <p className="text-[15px] font-bold text-neutral-400">아직 신고가 없습니다</p>
            <p className="text-[12px] text-neutral-600">유저가 게시글을 신고하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const auction = auctionMap.get(report.auction_id) as any;
              const reporter = reporterMap.get(report.reporter_id);

              return (
                <div
                  key={report.id}
                  className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3"
                >
                  {/* 상단: 사유 배지 + 시간 */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      report.reason === "fake_listing"
                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : report.reason === "scam_suspect"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700/50"
                    }`}>
                      {REASON_LABELS[report.reason] || report.reason}
                    </span>
                    <span className="text-[11px] text-neutral-600">
                      {new Date(report.created_at).toLocaleDateString("ko-KR", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>

                  {/* 경매 정보 */}
                  <div className="space-y-1">
                    <Link
                      href={`/auctions/${report.auction_id}`}
                      className="text-[14px] font-bold text-white hover:text-amber-400 transition-colors"
                    >
                      {auction?.title || "경매 정보 없음"}
                    </Link>
                    <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                      <span>클럽: {(auction?.club as any)?.name || "-"}</span>
                      <span>MD: {(auction?.md as any)?.name || "-"}</span>
                    </div>
                  </div>

                  {/* 메모 */}
                  {report.memo && (
                    <div className="bg-[#0A0A0A] rounded-xl p-3 border border-neutral-800/50">
                      <p className="text-[12px] text-neutral-400 leading-relaxed">{report.memo}</p>
                    </div>
                  )}

                  {/* 신고자 */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-neutral-600">
                      신고자: {reporter?.name || "알 수 없음"}
                    </span>
                    {countByAuction[report.auction_id] > 1 && (
                      <span className="text-[11px] font-bold text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        이 경매 {countByAuction[report.auction_id]}건 신고
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
