"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Star, Check, X, Instagram, Loader2 } from "lucide-react";

interface PendingReview {
  id: string;
  puzzle_id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  created_at: string;
  md_id: string;
  md_name: string | null;
  md_instagram: string | null;
  club_name: string | null;
  leader_name: string | null;
  event_date: string | null;
  area: string | null;
}

interface DeletionRequest {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  delete_reason: string | null;
  delete_requested_at: string;
  md_id: string;
  md_name: string | null;
  md_instagram: string | null;
  club_name: string | null;
  reviewer_name: string | null;
}

export function AdminVisitReviews() {
  const [rows, setRows] = useState<PendingReview[]>([]);
  const [delRows, setDelRows] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: dels, error: delErr }] = await Promise.all([
      supabase.rpc("admin_list_pending_visit_reviews"),
      supabase.rpc("admin_list_review_deletion_requests"),
    ]);
    if (error) toast.error(error.message);
    if (delErr) toast.error(delErr.message);
    setRows((data as PendingReview[]) ?? []);
    setDelRows((dels as DeletionRequest[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const resolveDeletion = async (id: string, approve: boolean) => {
    setBusyId(id);
    const { data, error } = await supabase.rpc("resolve_review_deletion", {
      p_review_id: id,
      p_approve: approve,
    });
    setBusyId(null);
    if (error || !(data as { success?: boolean })?.success) {
      toast.error(error?.message || (data as { error?: string })?.error || "실패");
      return;
    }
    toast.success(approve ? "삭제됨 · 프로필에서 사라져요" : "요청 반려 · 리뷰 유지");
    setDelRows((prev) => prev.filter((r) => r.id !== id));
  };

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    const { data, error } = await supabase.rpc("set_puzzle_review_status", {
      p_review_id: id,
      p_status: status,
    });
    setBusyId(null);
    if (error || !(data as { success?: boolean })?.success) {
      toast.error(error?.message || (data as { error?: string })?.error || "실패");
      return;
    }
    toast.success(status === "approved" ? "승인됨 · 파트너 프로필에 표시돼요" : "반려됨");
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (rows.length === 0 && delRows.length === 0) {
    return (
      <div className="text-center py-16 text-[13px] text-muted-foreground">
        검토 대기 중인 항목이 없어요
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 삭제 요청 ── */}
      {delRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-black text-red-400">🗑 리뷰 삭제 요청 {delRows.length}건</h2>
          {delRows.map((r) => (
            <div key={r.id} className="bg-card border border-red-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-black text-foreground truncate">{r.md_name ?? "파트너"}</p>
                <div className="flex items-center gap-0.5 shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`w-4 h-4 ${n <= r.rating ? "fill-amber-400 text-brand-amber" : "fill-transparent text-muted-foreground"}`} strokeWidth={1.5} />
                  ))}
                </div>
              </div>
              {r.comment && <p className="text-[13px] text-foreground/80 border-l border-border pl-3">&ldquo;{r.comment}&rdquo;</p>}
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
                <p className="text-[11px] font-bold text-red-400">삭제 요청 사유</p>
                <p className="text-[12.5px] text-foreground/80 mt-0.5">{r.delete_reason || "(사유 없음)"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">리뷰어 {r.reviewer_name ?? "?"} · {r.club_name ?? ""}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => resolveDeletion(r.id, true)}
                  className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <X className="w-4 h-4" strokeWidth={3} /> 삭제 승인
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => resolveDeletion(r.id, false)}
                  className="flex-1 h-10 rounded-xl border border-border bg-transparent text-foreground hover:bg-muted font-bold text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" strokeWidth={3} /> 유지(반려)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 신규 방문 리뷰 ── */}
      {rows.length > 0 && (
      <div className="space-y-3">
      <h2 className="text-[13px] font-black text-brand-amber">✨ 신규 방문 리뷰 {rows.length}건</h2>
      {rows.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {/* 파트너 */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-black text-foreground truncate">
                {r.md_name ?? "파트너"}
              </p>
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mt-0.5">
                {r.club_name && <span className="truncate">{r.club_name}</span>}
                {r.md_instagram && (
                  <a
                    href={`https://instagram.com/${r.md_instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-pink-400"
                  >
                    <Instagram className="w-3 h-3" />@{r.md_instagram.replace(/^@/, "")}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`w-4 h-4 ${n <= r.rating ? "fill-amber-400 text-brand-amber" : "fill-transparent text-muted-foreground"}`}
                  strokeWidth={1.5}
                />
              ))}
            </div>
          </div>

          {/* 태그 */}
          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <span key={t} className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* 멘트 */}
          {r.comment && (
            <p className="text-[13px] text-foreground/80 border-l border-border pl-3">&ldquo;{r.comment}&rdquo;</p>
          )}

          {/* 맥락 */}
          <p className="text-[11px] text-muted-foreground">
            방장 {r.leader_name ?? "?"} · {r.area ?? ""} {r.event_date ?? ""} 깃발
          </p>

          {/* 액션 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => decide(r.id, "approved")}
              className="flex-1 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" strokeWidth={3} /> 승인
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => decide(r.id, "rejected")}
              className="flex-1 h-10 rounded-xl border border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <X className="w-4 h-4" strokeWidth={3} /> 반려
            </button>
          </div>
        </div>
      ))}
      </div>
      )}
    </div>
  );
}
