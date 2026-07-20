"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

interface PuzzleReportActionsProps {
  reportId: string;
  status: string;
}

export function PuzzleReportActions({ reportId, status }: PuzzleReportActionsProps) {
  const [loading, setLoading] = useState<"approve" | "dismiss" | null>(null);
  const router = useRouter();

  if (status !== "pending") {
    return (
      <span
        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          status === "approved"
            ? "bg-red-500/15 text-red-400 border border-red-500/20"
            : "bg-green-500/15 text-money border border-green-500/20"
        }`}
      >
        {status === "approved" ? "승인됨" : "기각됨"}
      </span>
    );
  }

  const handleAction = async (next: "approved" | "dismissed") => {
    setLoading(next === "approved" ? "approve" : "dismiss");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("puzzle_content_reports")
        .update({ status: next, resolved_at: new Date().toISOString() })
        .eq("id", reportId);

      if (error) throw new Error(error.message);

      toast.success(
        next === "approved"
          ? "신고 승인 처리되었습니다. 깃발 별도 조치는 /admin/puzzles에서 진행하세요."
          : "신고가 기각되었습니다."
      );
      router.refresh();
    } catch {
      toast.error("처리에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-[11px] font-bold border-green-500/30 text-money hover:bg-green-500/10"
        onClick={() => handleAction("dismissed")}
        disabled={!!loading}
      >
        <X className="w-3 h-3 mr-1" />
        {loading === "dismiss" ? "처리중..." : "기각"}
      </Button>
      <Button
        size="sm"
        className="h-8 px-3 text-[11px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
        onClick={() => handleAction("approved")}
        disabled={!!loading}
      >
        <Check className="w-3 h-3 mr-1" />
        {loading === "approve" ? "처리중..." : "승인"}
      </Button>
    </div>
  );
}
