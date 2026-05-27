"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ReportStatus = "pending" | "resolved" | "rejected";

interface Row {
  id: string;
  club_id: string;
  reporter_id: string | null;
  category: string | null;
  message: string;
  status: ReportStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  club: { id: string; name: string; area: string | null } | null;
  reporter_name: string;
  reporter_role: string | null;
}

interface Props {
  rows: Row[];
}

const CATEGORY_LABELS: Record<string, string> = {
  operating_hours: "영업시간",
  tags: "태그",
  dresscode: "드레스코드",
  address: "주소",
  other: "기타",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export function ClubInfoReportsList({ rows }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "pending";
    return r.status !== "pending";
  });

  const updateStatus = async (id: string, status: ReportStatus, note?: string) => {
    setUpdating(id);
    try {
      const patch: Record<string, unknown> = {
        status,
        reviewed_at: new Date().toISOString(),
      };
      if (note !== undefined) patch.admin_note = note;
      const { error } = await supabase
        .from("club_info_reports")
        .update(patch)
        .eq("id", id);
      if (error) {
        toast.error(error.message || "처리 실패");
        return;
      }
      toast.success(status === "resolved" ? "반영 완료로 처리됐어요" : "기각됨");
      router.refresh();
    } finally {
      setUpdating(null);
    }
  };

  const handleResolve = async (row: Row) => {
    const note = window.prompt("처리 메모 (선택)", row.admin_note ?? "");
    if (note === null) return;
    updateStatus(row.id, "resolved", note);
  };

  const handleReject = async (row: Row) => {
    const note = window.prompt("기각 사유 (선택)", row.admin_note ?? "");
    if (note === null) return;
    updateStatus(row.id, "rejected", note);
  };

  return (
    <div className="space-y-3">
      {/* 필터 */}
      <div className="flex gap-2 mb-2">
        {(["pending", "done", "all"] as const).map((f) => {
          const label = f === "pending" ? "처리 대기" : f === "done" ? "처리됨" : "전체";
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${
                filter === f
                  ? "bg-white text-black"
                  : "bg-neutral-900 text-neutral-400 border border-neutral-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#1C1C1E] rounded-2xl border border-neutral-800">
          <p className="text-sm text-neutral-500">신고가 없어요</p>
        </div>
      ) : (
        filtered.map((row) => {
          const isDone = row.status !== "pending";
          return (
            <div
              key={row.id}
              className={`bg-[#1C1C1E] border rounded-2xl p-4 space-y-3 ${
                isDone ? "border-neutral-800/60 opacity-60" : "border-amber-500/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 flex-wrap">
                    <span className="font-bold">
                      {row.category ? CATEGORY_LABELS[row.category] ?? row.category : "기타"}
                    </span>
                    <span>·</span>
                    <span>{formatRelative(row.created_at)}</span>
                    <span>·</span>
                    <span className="font-medium">
                      {row.reporter_name}
                      {row.reporter_role === "md" && (
                        <span className="ml-1 text-[10px] text-amber-300 font-bold">MD</span>
                      )}
                      {row.reporter_role === "admin" && (
                        <span className="ml-1 text-[10px] text-purple-300 font-bold">ADMIN</span>
                      )}
                    </span>
                  </div>
                  <p className="text-[14px] text-white font-bold mt-1">
                    {row.club ? (
                      <Link
                        href={`/clubs/${row.club.id}`}
                        target="_blank"
                        className="hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                      >
                        {row.club.name}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : "(삭제된 클럽)"}
                    {row.club?.area && (
                      <span className="text-[12px] text-neutral-500 font-medium ml-1.5">
                        {row.club.area}
                      </span>
                    )}
                  </p>
                </div>
                {!isDone && (
                  <div className="shrink-0 flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleResolve(row)}
                      disabled={updating === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 hover:text-green-200 hover:bg-green-500/25 text-[11px] font-black transition-colors disabled:opacity-50"
                    >
                      {updating === row.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      반영완료
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(row)}
                      disabled={updating === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:text-red-200 hover:bg-red-500/25 text-[11px] font-black transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" />
                      기각
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-black/30 rounded-xl p-3">
                <p className="text-[13px] text-white whitespace-pre-wrap break-words">
                  {row.message}
                </p>
              </div>

              {isDone && (
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold ${
                      row.status === "resolved"
                        ? "bg-green-500/15 text-green-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {row.status === "resolved" ? "반영완료" : "기각"}
                  </span>
                  {row.reviewed_at && <span>{formatRelative(row.reviewed_at)}</span>}
                  {row.admin_note && (
                    <span className="text-neutral-400 truncate">— {row.admin_note}</span>
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
