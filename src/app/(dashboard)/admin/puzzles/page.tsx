import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPuzzleRefundButton } from "@/components/admin/AdminPuzzleRefundButton";
import { AdminPuzzleOffersDropdown } from "@/components/admin/AdminPuzzleOffersDropdown";
import { AlertTriangle, ChevronLeft, Flag } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string; area?: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  open: "모집 중",
  matched: "마감",
  accepted: "성사됨",
  cancelled: "취소됨",
  expired: "만료됨",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-green-500/20 text-green-400",
  matched: "bg-amber-500/20 text-amber-400",
  accepted: "bg-amber-500/20 text-amber-400",
  cancelled: "bg-neutral-700 text-neutral-400",
  expired: "bg-neutral-700 text-neutral-400",
};

export default async function AdminPuzzlesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { tab = "list", area: areaFilter } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day}(${days[d.getDay()]})`;
  };

  // 전체 깃발 탭 데이터
  const { data: allPuzzles } = await supabase
    .from("puzzles")
    .select("id, area, event_date, status, target_count, current_count, notes, created_at")
    .order("created_at", { ascending: false });

  const { data: allOffers } = await supabase
    .from("puzzle_offers")
    .select(`
      id, puzzle_id, status, table_type, proposed_price, includes, comment, created_at,
      club:clubs(name, area),
      md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, md_deal_count, instagram, kakao_open_chat_url, phone)
    `)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: true });

  type OfferRow = NonNullable<typeof allOffers>[number];
  const offersByPuzzle = (allOffers || []).reduce<Record<string, OfferRow[]>>((acc, offer) => {
    if (!acc[offer.puzzle_id]) acc[offer.puzzle_id] = [];
    acc[offer.puzzle_id].push(offer);
    return acc;
  }, {});

  // 지역 목록 추출 (전체 퍼즐 기준, 카운트 포함)
  const areaCountMap = (allPuzzles || []).reduce<Record<string, number>>((acc, p) => {
    if (!p.area) return acc;
    acc[p.area] = (acc[p.area] || 0) + 1;
    return acc;
  }, {});
  const areaList = Object.entries(areaCountMap).sort((a, b) => b[1] - a[1]);

  // 지역 필터 적용
  const filteredPuzzles = areaFilter
    ? (allPuzzles || []).filter((p) => p.area === areaFilter)
    : allPuzzles || [];

  // 신고 탭 데이터
  const { data: reports } = await supabase
    .from("puzzle_reports")
    .select("id, reason, created_at, puzzle_id, reporter_md_id")
    .order("created_at", { ascending: false });

  const puzzleIds = [...new Set((reports || []).map((r) => r.puzzle_id))];
  const puzzleMap = new Map<string, { id: string; area: string; event_date: string; status: string }>();

  if (puzzleIds.length > 0) {
    const { data: reportedPuzzles } = await supabase
      .from("puzzles")
      .select("id, area, event_date, status")
      .in("id", puzzleIds);
    for (const p of reportedPuzzles || []) puzzleMap.set(p.id, p);
  }

  const reportsByPuzzle = (reports || []).reduce((acc, report) => {
    if (!acc[report.puzzle_id]) acc[report.puzzle_id] = [];
    acc[report.puzzle_id].push(report);
    return acc;
  }, {} as Record<string, typeof reports>);

  const puzzleEntries = Object.entries(reportsByPuzzle);
  const pendingReportCount = reports?.length || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-2xl mx-auto px-4">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-5">
          <Link href="/admin" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <Flag className="w-5 h-5 text-purple-400" />
          <h1 className="text-[20px] font-black text-white">깃발 관리</h1>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          <Link href="?tab=list">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "list"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              전체 깃발 {allPuzzles ? `${allPuzzles.length}건` : ""}
            </button>
          </Link>
          <Link href="?tab=reports">
            <button
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                tab === "reports"
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              신고 관리{pendingReportCount > 0 ? ` (${pendingReportCount})` : ""}
            </button>
          </Link>
        </div>

        {/* 전체 깃발 탭 */}
        {tab === "list" && (
          <div className="space-y-4">
            {/* 지역 토글 */}
            {areaList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                <Link href="?tab=list">
                  <button
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                      !areaFilter
                        ? "bg-purple-500 text-white"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    }`}
                  >
                    전체 {allPuzzles?.length || 0}
                  </button>
                </Link>
                {areaList.map(([area, count]) => (
                  <Link key={area} href={`?tab=list&area=${encodeURIComponent(area)}`}>
                    <button
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                        areaFilter === area
                          ? "bg-purple-500 text-white"
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}
                    >
                      {area} {count}
                    </button>
                  </Link>
                ))}
              </div>
            )}

            {filteredPuzzles.length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{areaFilter ? `${areaFilter} 지역에 깃발이 없습니다` : "깃발이 없습니다"}</p>
              </div>
            ) : (
              filteredPuzzles.map((puzzle) => {
                const offers = offersByPuzzle[puzzle.id] || [];
                return (
                  <Card key={puzzle.id} className="bg-[#1C1C1E] border-neutral-800 p-5 space-y-4">
                    {/* 퍼즐 기본 정보 */}
                    <div className="flex items-start justify-between">
                      <div>
                        {puzzle.notes && (
                          <p className="text-[15px] font-black text-white">{puzzle.notes}</p>
                        )}
                        <p className={`${puzzle.notes ? "text-[13px] text-neutral-400" : "text-[16px] font-black text-white"}`}>
                          {formatDate(puzzle.event_date)} {puzzle.area}
                        </p>
                        <p className="text-[12px] text-neutral-600 mt-0.5">
                          파티 {puzzle.current_count}/{puzzle.target_count}명
                        </p>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[puzzle.status] || "bg-neutral-700 text-neutral-400"}`}>
                        {STATUS_LABEL[puzzle.status] || puzzle.status}
                      </span>
                    </div>

                    {/* 오퍼 드롭다운 */}
                    <AdminPuzzleOffersDropdown
                      offers={offers.map((o) => ({
                        id: o.id,
                        status: o.status,
                        table_type: o.table_type,
                        proposed_price: o.proposed_price,
                        includes: (o.includes as string[]) || [],
                        comment: o.comment,
                        club: o.club as { name?: string; area?: string } | null,
                        md: o.md as {
                          id?: string;
                          display_name?: string;
                          md_deal_count?: number;
                          instagram?: string | null;
                          kakao_open_chat_url?: string | null;
                          phone?: string | null;
                        } | null,
                      }))}
                    />
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* 신고 관리 탭 */}
        {tab === "reports" && (
          <div className="space-y-4">
            {puzzleEntries.length === 0 ? (
              <div className="text-center py-20 text-neutral-500">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>신고된 깃발이 없습니다</p>
              </div>
            ) : (
              puzzleEntries.map(([puzzleId, puzzleReports]) => {
                const puzzle = puzzleMap.get(puzzleId);
                const reportList = puzzleReports || [];
                const isCancelled = puzzle?.status === "cancelled";

                return (
                  <Card key={puzzleId} className="bg-[#1C1C1E] border-neutral-800 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        {puzzle ? (
                          <>
                            <p className="text-[15px] font-black text-white">
                              {formatDate(puzzle.event_date)} {puzzle.area}
                            </p>
                            <p className="text-[12px] text-neutral-500 mt-0.5">
                              ID: {puzzleId.slice(0, 8)}
                            </p>
                          </>
                        ) : (
                          <p className="text-[13px] text-neutral-400">깃발 ID: {puzzleId.slice(0, 8)}</p>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          isCancelled
                            ? "bg-neutral-700 text-neutral-400"
                            : puzzle?.status === "open"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {isCancelled ? "취소됨" : puzzle?.status || "unknown"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[12px] font-bold text-neutral-400">신고 {reportList.length}건</p>
                      {reportList.map((report) => (
                        <div
                          key={report!.id}
                          className="bg-neutral-900 rounded-lg px-3 py-2 text-[12px] text-neutral-300"
                        >
                          <span className="text-neutral-500 mr-2">
                            {new Date(report!.created_at).toLocaleDateString("ko-KR")}
                          </span>
                          {report!.reason}
                        </div>
                      ))}
                    </div>

                    {!isCancelled && <AdminPuzzleRefundButton puzzleId={puzzleId} />}
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
