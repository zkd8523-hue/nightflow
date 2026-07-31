"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ReportStatus = "pending" | "resolved" | "rejected";

export interface WordReportRow {
  id: string;
  club_id: string;
  club_name: string | null;
  normalized_word: string;
  word_label: string | null;
  reason: string;
  memo: string | null;
  status: ReportStatus;
  action_taken: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reporter_name: string;
  reporter_role: string | null;
  /** 같은 클럽·단어에 쌓인 미처리 신고 수 */
  same_word_count: number;
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  abuse: { label: "욕설·혐오", color: "bg-red-500/15 text-red-400 border border-red-500/20" },
  false_info: { label: "허위사실", color: "bg-amber-500/15 text-brand-amber border border-amber-500/20" },
  privacy: { label: "개인정보·명예훼손", color: "bg-orange-500/15 text-orange-400 border border-orange-500/20" },
  advertising: { label: "광고", color: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
  spam: { label: "스팸·도배", color: "bg-purple-500/15 text-purple-400 border border-purple-500/20" },
  other: { label: "기타", color: "bg-muted text-muted-foreground border border-border/50" },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function WordReportsList({ rows }: { rows: WordReportRow[] }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "pending";
    return r.status !== "pending";
  });

  async function review(
    row: WordReportRow,
    status: Exclude<ReportStatus, "pending">,
    action: "deleted" | "kept",
    note: string | null,
    /** true면 같은 클럽·단어의 미처리 신고를 한꺼번에 처리 */
    allSameWord: boolean
  ) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const patch = {
      status,
      action_taken: action,
      admin_note: note,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    };

    const query = supabase.from("club_word_cloud_reports").update(patch);
    const { error } = allSameWord
      ? await query
          .eq("club_id", row.club_id)
          .eq("normalized_word", row.normalized_word)
          .eq("status", "pending")
      : await query.eq("id", row.id);

    if (error) {
      toast.error(error.message || "처리 실패");
      return false;
    }
    return true;
  }

  async function handleDelete(row: WordReportRow) {
    if (
      !confirm(
        `"${row.word_label || row.normalized_word}" 단어를 ${row.club_name ?? "이 클럽"}에서 삭제할까요?\n(신고 ${row.same_word_count}건 함께 처리됨)`
      )
    )
      return;
    setWorking(row.id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_delete_club_word", {
        p_club_id: row.club_id,
        p_word: row.normalized_word,
        p_author_id: null,
      });
      if (error) {
        toast.error(error.message || "단어 삭제 실패");
        return;
      }
      const ok = await review(row, "resolved", "deleted", "단어 삭제", true);
      if (ok) {
        toast.success("단어를 삭제하고 신고를 처리했어요");
        router.refresh();
      }
    } finally {
      setWorking(null);
    }
  }

  async function handleKeep(row: WordReportRow) {
    const note = window.prompt("기각 사유 (선택)", row.admin_note ?? "");
    if (note === null) return;
    setWorking(row.id);
    try {
      const ok = await review(row, "rejected", "kept", note || null, false);
      if (ok) {
        toast.success("기각 처리했어요");
        router.refresh();
      }
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["pending", "done", "all"] as const).map((f) => {
          const label = f === "pending" ? "처리 대기" : f === "done" ? "처리됨" : "전체";
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${
                filter === f
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-card text-muted-foreground border border-border"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <p className="text-sm text-muted-foreground">신고가 없어요</p>
        </div>
      ) : (
        filtered.map((row) => {
          const isDone = row.status !== "pending";
          const reason = REASON_LABELS[row.reason] ?? REASON_LABELS.other;
          return (
            <div
              key={row.id}
              className={`bg-card border rounded-2xl p-4 space-y-3 ${
                isDone ? "border-border/60 opacity-60" : "border-red-500/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${reason.color}`}
                    >
                      {reason.label}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-pink-500/15 text-pink-300 text-[13px] font-black">
                      {row.word_label || row.normalized_word}
                    </span>
                    {!isDone && row.same_word_count > 1 && (
                      <span className="text-[11px] font-bold text-red-400">
                        누적 {row.same_word_count}건
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] font-bold text-foreground">
                    <Link
                      href={`/clubs/${row.club_id}`}
                      target="_blank"
                      className="hover:text-brand-amber transition-colors inline-flex items-center gap-1"
                    >
                      {row.club_name ?? "(삭제된 클럽)"}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelative(row.created_at)} · 신고자 {row.reporter_name}
                    {row.reporter_role === "md" && (
                      <span className="ml-1 text-[10px] text-brand-amber font-bold">파트너</span>
                    )}
                  </p>
                </div>

                {!isDone && (
                  <div className="shrink-0 flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      disabled={working === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 text-[11px] font-black transition-colors disabled:opacity-50"
                    >
                      {working === row.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeep(row)}
                      disabled={working === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-money hover:bg-green-500/25 text-[11px] font-black transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      유지
                    </button>
                  </div>
                )}
              </div>

              {row.memo && (
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-[13px] text-foreground whitespace-pre-wrap break-words">
                    {row.memo}
                  </p>
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold ${
                      row.action_taken === "deleted"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-green-500/15 text-money"
                    }`}
                  >
                    {row.action_taken === "deleted" ? "삭제됨" : "유지"}
                  </span>
                  {row.reviewed_at && <span>{formatRelative(row.reviewed_at)}</span>}
                  {row.admin_note && (
                    <span className="truncate">— {row.admin_note}</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
