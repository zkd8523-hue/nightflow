import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPuzzleRefundButton } from "@/components/admin/AdminPuzzleRefundButton";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminPuzzlesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  // 신고된 퍼즐 목록 조회
  const { data: reports } = await supabase
    .from("puzzle_reports")
    .select(`
      id,
      reason,
      created_at,
      puzzle_id,
      reporter_md_id
    `)
    .order("created_at", { ascending: false });

  // 퍼즐 기본 정보 조회
  const puzzleIds = [...new Set((reports || []).map(r => r.puzzle_id))];
  const puzzleMap = new Map<string, { id: string; area: string; event_date: string; status: string; leader_id: string }>();

  if (puzzleIds.length > 0) {
    const { data: puzzles } = await supabase
      .from("puzzles")
      .select("id, area, event_date, status, leader_id")
      .in("id", puzzleIds);

    for (const p of puzzles || []) {
      puzzleMap.set(p.id, p);
    }
  }

  // 퍼즐별로 그루핑
  const reportsByPuzzle = (reports || []).reduce((acc, report) => {
    if (!acc[report.puzzle_id]) acc[report.puzzle_id] = [];
    acc[report.puzzle_id].push(report);
    return acc;
  }, {} as Record<string, typeof reports>);

  const puzzleEntries = Object.entries(reportsByPuzzle);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center gap-3 py-5">
          <Link href="/admin" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-[20px] font-black text-white">깃발 신고 관리</h1>
        </div>

        {puzzleEntries.length === 0 ? (
          <div className="text-center py-20 text-neutral-500">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>신고된 깃발이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            {puzzleEntries.map(([puzzleId, puzzleReports]) => {
              const puzzle = puzzleMap.get(puzzleId);
              const reportList = puzzleReports || [];
              const isCancelled = puzzle?.status === "cancelled";

              return (
                <Card key={puzzleId} className="bg-[#1C1C1E] border-neutral-800 p-5 space-y-4">
                  {/* 퍼즐 기본 정보 */}
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

                  {/* 신고 목록 */}
                  <div className="space-y-2">
                    <p className="text-[12px] font-bold text-neutral-400">
                      신고 {reportList.length}건
                    </p>
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

                  {/* 환불 처리 버튼 */}
                  {!isCancelled && (
                    <AdminPuzzleRefundButton puzzleId={puzzleId} />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
