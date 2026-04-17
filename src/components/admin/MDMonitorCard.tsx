"use client";

import { useState } from "react";
import Link from "next/link";
import type { MDHealthScore } from "@/types/database";
import { computeHealthStatus } from "@/lib/utils/mdHealth";
import { MDHealthBadge } from "./MDHealthBadge";
import { MDActivityTimeline } from "./MDActivityTimeline";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface Props {
  md: MDHealthScore;
}

export function MDMonitorCard({ md }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = computeHealthStatus(md);

  const lastActive = md.last_auction_date
    ? dayjs(md.last_auction_date).fromNow()
    : "활동 없음";

  return (
    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden transition-all">
      {/* Clickable Header Area */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 cursor-pointer transition-colors hover:bg-[#2C2C2E] active:scale-[0.99]"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-white">
              {md.name?.[0] || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{md.name} MD</span>
                {md.md_status === "suspended" && (
                  <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                    SUSPENDED
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-400">
                {Array.isArray(md.area) ? md.area.join(", ") : md.area || "미지정"} · {lastActive}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MDHealthBadge status={status} />
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-neutral-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-neutral-600" />
            )}
          </div>
        </div>

        {/* 4 Metrics Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-xs text-neutral-500">경매</div>
            <div className="text-sm font-bold text-white">
              {md.total_auctions}건
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500">낙찰</div>
            <div className="text-sm font-bold text-white">
              {md.won_auctions}건
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500">낙찰액</div>
            <div className="text-sm font-bold text-green-500">
              {md.total_won_amount > 0
                ? formatPrice(md.total_won_amount)
                : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500">낙찰률</div>
            <div
              className={`text-sm font-bold ${
                md.sell_through_rate >= 60
                  ? "text-green-500"
                  : md.sell_through_rate >= 40
                    ? "text-amber-500"
                    : md.total_auctions > 0
                      ? "text-red-500"
                      : "text-neutral-600"
              }`}
            >
              {md.total_auctions > 0 ? `${md.sell_through_rate}%` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Activity Timeline */}
      {isExpanded && (
        <div className="border-t border-neutral-800/50 bg-neutral-900/30 px-4 pt-3 pb-4">
          {/* Section header + detail link */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              최근 활동
            </div>
            <Link
              href={`/admin/mds/${md.md_id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors font-medium"
            >
              상세 보기
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <MDActivityTimeline mdId={md.md_id} />
        </div>
      )}
    </div>
  );
}
