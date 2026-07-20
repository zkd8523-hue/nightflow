import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, AlertTriangle, Flag } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ReportActions } from "@/components/admin/ReportActions";
import { PuzzleReportActions } from "@/components/admin/PuzzleReportActions";

const AUCTION_REASON_LABELS: Record<string, string> = {
  fake_listing: "허위매물",
  scam_suspect: "사기 의심",
  other: "기타",
};

const PUZZLE_REASON_LABELS: Record<string, { label: string; color: string }> = {
  fake_listing: { label: "허위 모임", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  scam_suspect: { label: "사기 의심", color: "bg-amber-500/15 text-amber-400 border border-amber-500/20" },
  inappropriate_content: { label: "부적절 콘텐츠", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  harassment: { label: "괴롭힘·욕설", color: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
  spam: { label: "스팸/반복", color: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
  other: { label: "기타", color: "bg-neutral-800 text-neutral-400 border border-neutral-700/50" },
};

type SearchParams = Promise<{ tab?: string }>;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tab } = await searchParams;
  const activeTab: "auction" | "puzzle" = tab === "puzzle" ? "puzzle" : "auction";

  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  // 두 카운트 모두 헤더에 노출
  const [{ count: auctionReportCount }, { count: puzzleReportCount }] = await Promise.all([
    supabase.from("auction_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("puzzle_content_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  // 활성 탭 데이터만 로드
  const auctionData = activeTab === "auction"
    ? await loadAuctionReports(supabase)
    : null;
  const puzzleData = activeTab === "puzzle"
    ? await loadPuzzleReports(supabase)
    : null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/admin"
            className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">신고 관리</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              경매 {auctionReportCount || 0}건 / 깃발 {puzzleReportCount || 0}건 대기
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6 bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-1">
          <Link
            href="/admin/reports?tab=auction"
            className={`text-center py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              activeTab === "auction"
                ? "bg-white text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            경매 신고 ({auctionReportCount || 0})
          </Link>
          <Link
            href="/admin/reports?tab=puzzle"
            className={`text-center py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              activeTab === "puzzle"
                ? "bg-white text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            깃발 신고 ({puzzleReportCount || 0})
          </Link>
        </div>

        {activeTab === "auction" && auctionData && (
          <AuctionReportsView data={auctionData} />
        )}
        {activeTab === "puzzle" && puzzleData && (
          <PuzzleReportsView data={puzzleData} />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Auction Reports
// ────────────────────────────────────────────────────────────

async function loadAuctionReports(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: reports } = await supabase
    .from("auction_reports")
    .select(
      `
      id,
      reason,
      memo,
      created_at,
      auction_id,
      reporter_id,
      status,
      resolved_at
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const auctionIds = [...new Set(reports?.map((r) => r.auction_id) || [])];
  const reporterIds = [...new Set(reports?.map((r) => r.reporter_id) || [])];

  const { data: auctions } =
    auctionIds.length > 0
      ? await supabase
          .from("auctions")
          .select("id, title, club:clubs(name), md:users!auctions_md_id_fkey(name)")
          .in("id", auctionIds)
      : { data: [] };

  const { data: reporters } =
    reporterIds.length > 0
      ? await supabase.from("users").select("id, name").in("id", reporterIds)
      : { data: [] };

  const auctionMap = new Map((auctions || []).map((a) => [a.id, a]));
  const reporterMap = new Map((reporters || []).map((u) => [u.id, u]));

  const countByAuction = (reports || []).reduce((acc, r) => {
    acc[r.auction_id] = (acc[r.auction_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pending = (reports || []).filter((r) => r.status === "pending");
  const resolved = (reports || []).filter((r) => r.status !== "pending");

  return { reports: reports || [], auctionMap, reporterMap, countByAuction, pending, resolved };
}

function AuctionReportsView({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof loadAuctionReports>>>;
}) {
  const { reports, auctionMap, reporterMap, countByAuction, pending, resolved } = data;

  return (
    <>
      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{pending.length}</p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">미처리</p>
        </Card>
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-red-400">
            {resolved.filter((r) => r.status === "approved").length}
          </p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">승인됨</p>
        </Card>
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-green-400">
            {resolved.filter((r) => r.status === "dismissed").length}
          </p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">기각됨</p>
        </Card>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Flag className="w-10 h-10 text-neutral-700 mx-auto" />
          <p className="text-[15px] font-bold text-neutral-400">아직 신고가 없습니다</p>
          <p className="text-[12px] text-neutral-600">
            유저가 경매를 신고하면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const auction = auctionMap.get(report.auction_id) as
              | {
                  title?: string;
                  club?: { name?: string } | null;
                  md?: { name?: string } | null;
                }
              | undefined;
            const reporter = reporterMap.get(report.reporter_id);

            return (
              <div
                key={report.id}
                className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      report.reason === "fake_listing"
                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : report.reason === "scam_suspect"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700/50"
                    }`}
                  >
                    {AUCTION_REASON_LABELS[report.reason] || report.reason}
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    {new Date(report.created_at).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="space-y-1">
                  <Link
                    href={`/auctions/${report.auction_id}`}
                    className="text-[14px] font-bold text-white hover:text-amber-400 transition-colors"
                  >
                    {auction?.title || "경매 정보 없음"}
                  </Link>
                  <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <span>클럽: {auction?.club?.name || "-"}</span>
                    <span>파트너: {auction?.md?.name || "-"}</span>
                  </div>
                </div>

                {report.memo && (
                  <div className="bg-[#0A0A0A] rounded-xl p-3 border border-neutral-800/50">
                    <p className="text-[12px] text-neutral-400 leading-relaxed">
                      {report.memo}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
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
                  <ReportActions
                    reportId={report.id}
                    status={report.status ?? "pending"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Puzzle Reports
// ────────────────────────────────────────────────────────────

async function loadPuzzleReports(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: reports } = await supabase
    .from("puzzle_content_reports")
    .select("id, puzzle_id, reporter_id, reason, memo, status, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const puzzleIds = [...new Set((reports || []).map((r) => r.puzzle_id))];
  const reporterIds = [...new Set((reports || []).map((r) => r.reporter_id))];

  const { data: puzzles } =
    puzzleIds.length > 0
      ? await supabase
          .from("puzzles")
          .select(
            "id, status, leader_id, leader:users!puzzles_leader_id_fkey(id, display_name, name)"
          )
          .in("id", puzzleIds)
      : { data: [] };

  const { data: reporters } =
    reporterIds.length > 0
      ? await supabase.from("users").select("id, name, display_name").in("id", reporterIds)
      : { data: [] };

  const puzzleMap = new Map((puzzles || []).map((p) => [p.id, p]));
  const reporterMap = new Map((reporters || []).map((u) => [u.id, u]));

  const countByPuzzle = (reports || []).reduce((acc, r) => {
    acc[r.puzzle_id] = (acc[r.puzzle_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pending = (reports || []).filter((r) => r.status === "pending");
  const resolved = (reports || []).filter((r) => r.status !== "pending");

  return { reports: reports || [], puzzleMap, reporterMap, countByPuzzle, pending, resolved };
}

function PuzzleReportsView({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof loadPuzzleReports>>>;
}) {
  const { reports, puzzleMap, reporterMap, countByPuzzle, pending, resolved } = data;

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{pending.length}</p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">미처리</p>
        </Card>
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-red-400">
            {resolved.filter((r) => r.status === "approved").length}
          </p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">승인됨</p>
        </Card>
        <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
          <p className="text-2xl font-black text-green-400">
            {resolved.filter((r) => r.status === "dismissed").length}
          </p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">기각됨</p>
        </Card>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Flag className="w-10 h-10 text-neutral-700 mx-auto" />
          <p className="text-[15px] font-bold text-neutral-400">아직 신고가 없습니다</p>
          <p className="text-[12px] text-neutral-600">
            유저가 깃발을 신고하면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const puzzle = puzzleMap.get(report.puzzle_id) as
              | {
                  status?: string;
                  leader?: { id?: string; display_name?: string | null; name?: string | null } | null;
                }
              | undefined;
            const reporter = reporterMap.get(report.reporter_id) as
              | { display_name?: string | null; name?: string | null }
              | undefined;
            const reasonMeta =
              PUZZLE_REASON_LABELS[report.reason] || PUZZLE_REASON_LABELS.other;
            const leaderName =
              puzzle?.leader?.display_name || puzzle?.leader?.name || "방장 정보 없음";

            return (
              <div
                key={report.id}
                className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${reasonMeta.color}`}
                  >
                    {reasonMeta.label}
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    {new Date(report.created_at).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="space-y-1">
                  <Link
                    href={`/flags/${report.puzzle_id}`}
                    className="text-[14px] font-bold text-white hover:text-amber-400 transition-colors"
                  >
                    깃발 보기 →
                  </Link>
                  <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <span>방장: {leaderName}</span>
                    <span>상태: {puzzle?.status || "-"}</span>
                  </div>
                </div>

                {report.memo && (
                  <div className="bg-[#0A0A0A] rounded-xl p-3 border border-neutral-800/50">
                    <p className="text-[12px] text-neutral-400 leading-relaxed">
                      {report.memo}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] text-neutral-600">
                      신고자: {reporter?.display_name || reporter?.name || "알 수 없음"}
                    </span>
                    {countByPuzzle[report.puzzle_id] > 1 && (
                      <span className="text-[11px] font-bold text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        이 깃발 {countByPuzzle[report.puzzle_id]}건 신고
                      </span>
                    )}
                  </div>
                  <PuzzleReportActions
                    reportId={report.id}
                    status={report.status ?? "pending"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
