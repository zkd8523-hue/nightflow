"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

interface ReportActionsProps {
  reportId: string;
  status: string;
}

export function ReportActions({ reportId, status }: ReportActionsProps) {
  const [loading, setLoading] = useState<"approve" | "dismiss" | null>(null);
  const router = useRouter();

  if (status !== "pending") {
    return (
      <span
        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          status === "approved"
            ? "bg-red-500/15 text-red-400 border border-red-500/20"
            : "bg-green-500/15 text-green-400 border border-green-500/20"
        }`}
      >
        {status === "approved" ? "승인됨" : "기각됨"}
      </span>
    );
  }

  const handleAction = async (action: "approved" | "dismissed") => {
    setLoading(action === "approved" ? "approve" : "dismiss");
    try {
      const supabase = createClient();
      const rpc = action === "approved"
        ? "approve_auction_report"
        : "dismiss_auction_report";

      const { error } = await supabase.rpc(rpc, { p_report_id: reportId });

      if (error) throw new Error(error.message);

      toast.success(
        action === "approved"
          ? "신고 승인: 경매가 취소되고 MD 경고가 누적되었습니다."
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
        className="h-8 px-3 text-[11px] font-bold border-green-500/30 text-green-400 hover:bg-green-500/10"
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
