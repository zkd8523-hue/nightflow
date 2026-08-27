"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, X, Trash2 } from "lucide-react";

/**
 * 공연 댓글 신고 처리 (Migration 603).
 *
 * 다른 신고 큐와 다른 점: 여기서 댓글을 바로 지울 수 있다.
 * 깃발·경매는 대상이 무거워서 별도 화면으로 보내지만, 댓글은 한 줄짜리라
 * 신고를 보는 자리에서 판단하고 끝내는 게 맞다.
 */
export function EventCommentReportActions({
  reportId,
  commentId,
  status,
  commentDeleted,
}: {
  reportId: string;
  commentId: string;
  status: string;
  /** 댓글이 이미 지워졌으면 삭제 버튼을 감춘다 */
  commentDeleted: boolean;
}) {
  const [loading, setLoading] = useState<"resolve" | "reject" | "delete" | null>(null);
  const router = useRouter();

  if (status !== "pending") {
    return (
      <span
        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          status === "resolved"
            ? "bg-red-500/15 text-red-400 border border-red-500/20"
            : "bg-green-500/15 text-money border border-green-500/20"
        }`}
      >
        {status === "resolved" ? "조치함" : "기각됨"}
      </span>
    );
  }

  async function updateStatus(next: "resolved" | "rejected") {
    setLoading(next === "resolved" ? "resolve" : "reject");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("event_comment_reports")
        .update({ status: next, reviewed_at: new Date().toISOString() })
        .eq("id", reportId);
      if (error) throw new Error(error.message);
      toast.success(next === "resolved" ? "조치 완료로 표시했습니다" : "신고를 기각했습니다");
      router.refresh();
    } catch {
      toast.error("처리에 실패했습니다");
    } finally {
      setLoading(null);
    }
  }

  /** 댓글 삭제 + 신고를 한 번에 닫는다 — 지웠는데 큐에 남아 있으면 두 번 일한다 */
  async function deleteComment() {
    if (!confirm("이 댓글을 삭제하고 신고를 조치 완료로 처리할까요?")) return;
    setLoading("delete");
    try {
      const supabase = createClient();
      // 댓글이 지워지면 신고도 CASCADE로 사라지므로 상태를 먼저 남긴다
      await supabase
        .from("event_comment_reports")
        .update({ status: "resolved", reviewed_at: new Date().toISOString() })
        .eq("id", reportId);
      const { error } = await supabase.from("event_comments").delete().eq("id", commentId);
      if (error) throw new Error(error.message);
      toast.success("댓글을 삭제했습니다");
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-[11px] font-bold border-green-500/30 text-money hover:bg-green-500/10"
        onClick={() => updateStatus("rejected")}
        disabled={!!loading}
      >
        <X className="w-3 h-3 mr-1" />
        {loading === "reject" ? "처리중..." : "기각"}
      </Button>
      <Button
        size="sm"
        className="h-8 px-3 text-[11px] font-bold bg-amber-500/20 text-brand-amber hover:bg-amber-500/30 border border-amber-500/30"
        onClick={() => updateStatus("resolved")}
        disabled={!!loading}
      >
        <Check className="w-3 h-3 mr-1" />
        {loading === "resolve" ? "처리중..." : "조치함"}
      </Button>
      {!commentDeleted && (
        <Button
          size="sm"
          className="h-8 px-3 text-[11px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
          onClick={deleteComment}
          disabled={!!loading}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          {loading === "delete" ? "삭제중..." : "댓글 삭제"}
        </Button>
      )}
    </div>
  );
}
