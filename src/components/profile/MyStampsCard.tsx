"use client";

import Link from "next/link";
import {
  Ticket,
  ChevronRight,
  Sparkles,
  Info,
} from "lucide-react";
import { useMyStamps } from "@/hooks/useMyStamps";

/**
 * MY 페이지 스탬프 카드 (Migration 413 my_stamp_status)
 *   - 상단: 현재 잔량 + "상품 바꾸기 →" (→ /my/stamps)
 *   - 하단: "스탬프 모으는 법 ⓘ" 안내 + LIVE 바로가기
 */
export function MyStampsCard() {
  const { status, loading } = useMyStamps();

  return (
    <div className="bg-gradient-to-br from-red-500/10 via-neutral-900 to-neutral-900 border border-red-500/30 rounded-2xl mb-4 overflow-hidden">
      {/* 상단: 잔량 + 상품 바꾸러 가기 */}
      <Link
        href="/my/stamps"
        className="w-full flex items-center justify-between gap-3 p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-baseline gap-1.5">
              <span className="text-white text-[22px] font-black leading-none">
                {loading ? "—" : status.current_count}
              </span>
              <span className="text-neutral-400 text-[12px] font-bold">개</span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              내 스탬프{" "}
              {status.total_earned > 0 && (
                <span className="text-neutral-600">· 누적 {status.total_earned}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-red-300 text-[12px] font-black">
          <Sparkles className="w-3.5 h-3.5" />
          상품 보러가기
          <ChevronRight className="w-4 h-4" />
        </div>
      </Link>

      {/* 하단: 스탬프 모으는 법 안내 */}
      <div className="border-t border-red-500/20 px-5 py-4 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-white text-[12px] font-bold">
            스탬프 모으는 법
          </div>
          <div className="text-neutral-500 text-[11px] mt-0.5 leading-snug">
            클럽에서 LIVE 클립을 올리면 스탬프 지급!
          </div>
        </div>
      </div>
    </div>
  );
}
