"use client";

import type { MDHealthScore } from "@/types/database";
import { computeHealthStatus } from "@/lib/utils/mdHealth";
import { AlertCircle, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  mds: MDHealthScore[];
  onMDClick: (mdId: string) => void;
}

export function MDAlertBanner({ mds, onMDClick }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);

  const alertMDs = mds.filter((md) => {
    const status = computeHealthStatus(md);
    return status === "critical" || status === "attention";
  });

  if (alertMDs.length === 0) return null;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-white">
            주의가 필요한 MD {alertMDs.length}명
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-neutral-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-neutral-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-amber-500/10">
          {alertMDs.map((md) => {
            const status = computeHealthStatus(md);
            const isCritical = status === "critical";

            let reason = "";
            if (md.flag_consecutive_noshow) reason = "7일내 노쇼 2건 발생";
            else if (md.flag_dormant) reason = "30일간 경매 없음";
            else if (md.noshow_count > 0) reason = `노쇼 ${md.noshow_count}건`;
            else if (md.sell_through_rate < 30 && md.total_auctions >= 5)
              reason = `낙찰률 ${md.sell_through_rate}%`;
            else reason = "운영 품질 주의";

            return (
              <button
                key={md.md_id}
                onClick={() => onMDClick(md.md_id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-500/5 transition-colors border-b border-amber-500/10 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${isCritical ? "bg-red-500" : "bg-amber-500"}`}
                  />
                  <div className="text-left">
                    <div className="font-bold text-white">{md.name} MD</div>
                    <div className="text-sm text-neutral-400">
                      {Array.isArray(md.area) ? md.area.join(", ") : md.area || "미지정"} · {reason}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
