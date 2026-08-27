import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, AlertTriangle, Flag } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ReportActions } from "@/components/admin/ReportActions";
import { PuzzleReportActions } from "@/components/admin/PuzzleReportActions";
import { EventCommentReportActions } from "@/components/admin/EventCommentReportActions";

const AUCTION_REASON_LABELS: Record<string, string> = {
  fake_listing: "허위매물",
  scam_suspect: "사기 의심",
  other: "기타",
};

const PUZZLE_REASON_LABELS: Record<string, { label: string; color: string }> = {
  fake_listing: { label: "허위 모임", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  scam_suspect: { label: "사기 의심", color: "bg-amber-500/15 text-brand-amber border border-amber-500/20" },
  inappropriate_content: { label: "부적절 콘텐츠", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  harassment: { label: "괴롭힘·욕설", color: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
  spam: { label: "스팸/반복", color: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
  other: { label: "기타", color: "bg-muted text-muted-foreground border border-border/50" },
};

const COMMENT_REASON_LABELS: Record<string, { label: string; color: string }> = {
  spam: { label: "스팸", color: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
  abuse: { label: "욕설·괴롭힘", color: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
  sexual: { label: "선정성", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  advertising: { label: "광고", color: "bg-blue-500/15 text-blue-400 border border-blue-500/20" },
  other: { label: "기타", color: "bg-muted text-muted-foreground border border-border/50" },
};

type SearchParams = Promise<{ tab?: string }>;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tab } = await searchParams;
  const activeTab: "auction" | "puzzle" | "comment" =
    tab === "puzzle" ? "puzzle" : tab === "comment" ? "comment" : "auction";

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
  const [
    { count: auctionReportCount },
    { count: puzzleReportCount },
    { count: commentReportCount },
  ] = await Promise.all([
    supabase.from("auction_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("puzzle_content_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // 603 미적용 환경에서도 페이지가 죽지 않게 한다
    supabase
      .from("event_comment_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then((r) => r, () => ({ count: 0 })),
  ]);

  // 활성 탭 데이터만 로드
  const auctionData = activeTab === "auction"
    ? await loadAuctionReports(supabase)
    : null;
  const puzzleData = activeTab === "puzzle"
    ? await loadPuzzleReports(supabase)
    : null;
  const commentData = activeTab === "comment"
    ? await loadCommentReports(supabase)
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/admin"
            className="p-2 -ml-2 hover:bg-muted rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">신고 관리</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              경매 {auctionReportCount || 0}건 / 깃발 {puzzleReportCount || 0}건 / 댓글{" "}
              {commentReportCount || 0}건 대기
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-2 mb-6 bg-card border border-border rounded-2xl p-1">
          <Link
            href="/admin/reports?tab=auction"
            className={`text-center py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              activeTab === "auction"
                ? "bg-inverse text-inverse-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            경매 신고 ({auctionReportCount || 0})
          </Link>
          <Link
            href="/admin/reports?tab=puzzle"
            className={`text-center py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              activeTab === "puzzle"
                ? "bg-inverse text-inverse-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            깃발 신고 ({puzzleReportCount || 0})
          </Link>
          <Link
            href="/admin/reports?tab=comment"
            className={`text-center py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              activeTab === "comment"
                ? "bg-inverse text-inverse-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            댓글 신고 ({commentReportCount || 0})
          </Link>
        </div>

        {activeTab === "auction" && auctionData && (
          <AuctionReportsView data={auctionData} />
        )}
        {activeTab === "puzzle" && puzzleData && (
          <PuzzleReportsView data={puzzleData} />
        )}
        {activeTab === "comment" && commentData && (
          <CommentReportsView data={commentData} />
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
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-brand-amber">{pending.length}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">미처리</p>
        </Card>
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-red-400">
            {resolved.filter((r) => r.status === "approved").length}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">승인됨</p>
        </Card>
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-money">
            {resolved.filter((r) => r.status === "dismissed").length}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">기각됨</p>
        </Card>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Flag className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-[15px] font-bold text-muted-foreground">아직 신고가 없습니다</p>
          <p className="text-[12px] text-muted-foreground">
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
                className="bg-card border border-border/50 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      report.reason === "fake_listing"
                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : report.reason === "scam_suspect"
                        ? "bg-amber-500/15 text-brand-amber border border-amber-500/20"
                        : "bg-muted text-muted-foreground border border-border/50"
                    }`}
                  >
                    {AUCTION_REASON_LABELS[report.reason] || report.reason}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
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
                    className="text-[14px] font-bold text-foreground hover:text-brand-amber transition-colors"
                  >
                    {auction?.title || "경매 정보 없음"}
                  </Link>
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span>클럽: {auction?.club?.name || "-"}</span>
                    <span>파트너: {auction?.md?.name || "-"}</span>
                  </div>
                </div>

                {report.memo && (
                  <div className="bg-background rounded-xl p-3 border border-border/50">
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      {report.memo}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
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
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-brand-amber">{pending.length}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">미처리</p>
        </Card>
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-red-400">
            {resolved.filter((r) => r.status === "approved").length}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">승인됨</p>
        </Card>
        <Card className="bg-card border-border/50 p-4 text-center">
          <p className="text-2xl font-black text-money">
            {resolved.filter((r) => r.status === "dismissed").length}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">기각됨</p>
        </Card>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Flag className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-[15px] font-bold text-muted-foreground">아직 신고가 없습니다</p>
          <p className="text-[12px] text-muted-foreground">
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
                className="bg-card border border-border/50 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${reasonMeta.color}`}
                  >
                    {reasonMeta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
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
                    className="text-[14px] font-bold text-foreground hover:text-brand-amber transition-colors"
                  >
                    깃발 보기 →
                  </Link>
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span>방장: {leaderName}</span>
                    <span>상태: {puzzle?.status || "-"}</span>
                  </div>
                </div>

                {report.memo && (
                  <div className="bg-background rounded-xl p-3 border border-border/50">
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      {report.memo}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
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

/* ==========================================================================
   공연 댓글 신고 (Migration 603)
   ========================================================================== */

async function loadCommentReports(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: reports } = await supabase
    .from("event_comment_reports")
    .select("id, comment_id, reporter_id, reason, message, status, created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  const list = reports ?? [];

  // 신고된 댓글 본문 — 무엇을 신고했는지 안 보이면 판단할 수가 없다.
  // 이미 지워진 댓글은 조회에 안 잡히므로 "삭제됨"으로 표시한다.
  const commentIds = [...new Set(list.map((r) => r.comment_id))];
  const { data: comments } = commentIds.length
    ? await supabase
        .from("event_comments")
        .select("id, content, media, author_id, event_id, is_deleted, created_at")
        .in("id", commentIds)
    : { data: [] };

  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))];
  const reporterIds = [...new Set(list.map((r) => r.reporter_id))];
  const { data: users } = [...authorIds, ...reporterIds].length
    ? await supabase
        .from("users")
        .select("id, name, display_name")
        .in("id", [...new Set([...authorIds, ...reporterIds])])
    : { data: [] };

  return { reports: list, comments: comments ?? [], users: users ?? [] };
}

function CommentReportsView({
  data,
}: {
  data: Awaited<ReturnType<typeof loadCommentReports>>;
}) {
  const { reports, comments, users } = data;

  if (reports.length === 0) {
    return (
      <div className="text-center py-16">
        <Flag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-[15px] font-bold text-muted-foreground">아직 신고가 없습니다</p>
        <p className="text-[12px] text-muted-foreground mt-1">
          유저가 공연 댓글을 신고하면 여기에 표시됩니다
        </p>
      </div>
    );
  }

  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.display_name || u?.name || "알 수 없음";
  };

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const c = comments.find((x) => x.id === r.comment_id);
        const reason = COMMENT_REASON_LABELS[r.reason] ?? COMMENT_REASON_LABELS.other;
        // 조회에 안 잡히거나 is_deleted면 이미 지워진 댓글
        const deleted = !c || c.is_deleted;

        return (
          <Card key={r.id} className="p-4 bg-card border-border">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${reason.color}`}>
                {reason.label}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {new Date(r.created_at).toLocaleString("ko-KR")}
              </span>
            </div>

            {/* 신고된 댓글 본문 */}
            <div className="rounded-xl bg-muted/40 border border-border/50 p-3 mb-2.5">
              {deleted ? (
                <p className="text-[13px] text-muted-foreground italic">
                  삭제된 댓글입니다
                </p>
              ) : (
                <>
                  <p className="text-[12px] font-bold text-muted-foreground mb-1">
                    {nameOf(c.author_id)}
                  </p>
                  {c.content && (
                    <p className="text-[13.5px] whitespace-pre-wrap break-words">
                      {c.content}
                    </p>
                  )}
                  {Array.isArray(c.media) && c.media.length > 0 && (
                    <p className="text-[12px] text-muted-foreground mt-1">
                      사진 {c.media.length}장 첨부
                    </p>
                  )}
                  <Link
                    href={`/events`}
                    className="inline-block text-[11px] text-brand-amber font-bold mt-1.5"
                  >
                    공연 보기 →
                  </Link>
                </>
              )}
            </div>

            <p className="text-[12px] text-muted-foreground mb-1">
              신고자: {nameOf(r.reporter_id)}
            </p>
            {r.message && (
              <p className="text-[12.5px] text-foreground mb-2.5">사유: {r.message}</p>
            )}

            <div className="mt-2.5">
              <EventCommentReportActions
                reportId={r.id}
                commentId={r.comment_id}
                status={r.status}
                commentDeleted={deleted}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
