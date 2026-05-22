"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, AlertTriangle, CheckCircle2, XCircle, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import Link from "next/link";

dayjs.locale("ko");

interface PuzzleNoshowReportRow {
  id: string;
  proposed_price: number;
  table_type: string | null;
  visit_marked_at: string;
  visit_requested_at: string | null;
  puzzle_id: string | null;
  puzzle_area: string | null;
  puzzle_event_date: string | null;
  leader_id: string | null;
  leader_name: string | null;
  leader_display_name: string | null;
  leader_strike_count: number | null;
  md_id: string | null;
  md_name: string | null;
  md_display_name: string | null;
  club_name: string | null;
}

export default function AdminPuzzleNoshowReportsPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = createClient();

  const [reports, setReports] = useState<PuzzleNoshowReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user || user.role !== "admin") {
      router.push("/");
      return;
    }

    const fetchReports = async () => {
      const { data, error } = await supabase.rpc("admin_list_puzzle_noshow_reports");

      if (error) {
        console.error("[puzzle-noshow-reports] fetch error", error);
      }

      setReports((data as PuzzleNoshowReportRow[]) || []);
      setLoading(false);
    };

    fetchReports();
  }, [user, userLoading, router, supabase]);

  const handleApplyStrike = async (offerId: string) => {
    if (!confirm("이 신고를 인용하고 방장에게 스트라이크를 적용합니다.\n방장은 이의제기를 신청할 수 있습니다.")) return;
    setProcessing(offerId);
    try {
      const { data, error } = await supabase.rpc("admin_apply_puzzle_strike", { p_offer_id: offerId });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "처리 실패");
      toast.success("스트라이크가 적용되었습니다. 방장은 이의제기를 통해 다툴 수 있어요.");
      setReports((prev) => prev.filter((r) => r.id !== offerId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류");
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (offerId: string) => {
    if (!confirm("이 신고(제안 기록)를 완전히 삭제합니다.\n관련 노쇼 표시까지 함께 사라지며 되돌릴 수 없어요. 진행할까요?")) return;
    setProcessing(offerId);
    try {
      const { data, error } = await supabase.rpc("admin_delete_puzzle_offer", { p_offer_id: offerId });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "삭제 실패");
      toast.success("신고 기록이 삭제됐습니다.");
      setReports((prev) => prev.filter((r) => r.id !== offerId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 중 오류");
    } finally {
      setProcessing(null);
    }
  };

  const handleDismiss = async (offerId: string) => {
    if (!confirm("이 신고를 기각합니다.\n방장에게 스트라이크는 적용되지 않습니다.")) return;
    setProcessing(offerId);
    try {
      // strike_applied_at만 설정해서 처리 완료 표시(스트라이크 없이 큐에서 제외)
      const { error } = await supabase
        .from("puzzle_offers")
        .update({
          strike_applied_at: new Date().toISOString(),
          strike_applied_by: user?.id ?? null,
        })
        .eq("id", offerId);
      if (error) throw error;
      toast.success("신고가 기각되었습니다.");
      setReports((prev) => prev.filter((r) => r.id !== offerId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류");
    } finally {
      setProcessing(null);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">연락 미수신 신고</h1>
          {reports.length > 0 && (
            <span className="text-[13px] text-neutral-500">{reports.length}건 대기</span>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5 text-[12px] text-amber-300 leading-relaxed">
          MD가 오퍼 수락 후 방장과 연락이 닿지 않았다고 표시한 건입니다. 인용 시 방장에게 스트라이크가 적용되며,
          방장은 <Link href="/admin/appeals" className="underline">이의제기 페이지</Link>에서 다툴 수 있어요.
        </div>

        {reports.length === 0 ? (
          <div className="py-20 text-center text-neutral-500 text-[14px]">
            <CheckCircle2 className="w-10 h-10 text-green-500/60 mx-auto mb-3" />
            대기 중인 신고가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const eventDate = r.puzzle_event_date
                ? dayjs(r.puzzle_event_date).format("M/D (ddd)")
                : "날짜 미정";
              const markedAt = dayjs(r.visit_marked_at).format("M/D HH:mm");
              const leaderName = r.leader_display_name || r.leader_name || "방장";
              const mdName = r.md_display_name || r.md_name || "MD";
              const leaderStrikes = r.leader_strike_count ?? 0;
              return (
                <div key={r.id} className="bg-[#1C1C1E] rounded-2xl p-4 border border-red-500/20 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[12px] text-neutral-400 font-bold flex-wrap">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span>{eventDate}</span>
                        {r.puzzle_area && <span>· {r.puzzle_area}</span>}
                        {r.club_name && <span>· {r.club_name}</span>}
                      </div>
                      <div className="mt-1.5 text-[13px] text-white">
                        <span className="font-bold text-red-400">{mdName}</span>
                        <span className="text-neutral-500"> 가 </span>
                        <span className="font-bold">{leaderName}</span>
                        <span className="text-neutral-500"> 와 연락 미수신 신고</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        제안가 {r.proposed_price.toLocaleString()}원 · 신고 {markedAt}
                        {leaderStrikes > 0 && (
                          <span className="ml-2 text-amber-400 font-bold">방장 스트라이크 {leaderStrikes}</span>
                        )}
                      </div>
                    </div>
                    {r.puzzle_id && (
                      <Link
                        href={`/flags/${r.puzzle_id}`}
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                      >
                        퍼즐 <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApplyStrike(r.id)}
                      disabled={processing === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-[13px] rounded-xl transition-colors disabled:opacity-40"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {processing === r.id ? "처리 중..." : "스트라이크 적용"}
                    </button>
                    <button
                      onClick={() => handleDismiss(r.id)}
                      disabled={processing === r.id}
                      className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-black text-[12px] rounded-xl transition-colors disabled:opacity-40 flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      기각
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={processing === r.id}
                      className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-300 font-black text-[12px] rounded-xl transition-colors disabled:opacity-40 flex items-center gap-1"
                      title="신고 기록 완전 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      삭제
                    </button>
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
