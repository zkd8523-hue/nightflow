"use client";

import Link from "next/link";
import { ArrowLeft, Ticket, Sparkles, type LucideIcon, Milk, ShoppingBag, Dice5 } from "lucide-react";
import { toast } from "sonner";
import { useMyStamps } from "@/hooks/useMyStamps";

/**
 * 스탬프 → 보상 교환 페이지 (Migration 413 my_stamp_status)
 * 1차 출시: 카탈로그 하드코딩. 교환 버튼은 "준비 중" 안내.
 * 실제 카탈로그/교환 RPC는 후속 마이그레이션(414+)에서 도입.
 */

interface RewardItem {
  id: string;
  name: string;
  description: string;
  stamp_cost: number;
  icon: LucideIcon;
  stock?: string; // "재고 3" 등 표시용
}

// 1차 오픈 카탈로그 (2/5/10 스탬프 티어)
const REWARDS: RewardItem[] = [
  {
    id: "chocoemong",
    name: "초코에몽",
    description: "편의점 초코에몽",
    stamp_cost: 2,
    icon: Milk,
    stock: "주 100개 선착순",
  },
  {
    id: "raffle",
    name: "월간 추첨 응모",
    description: "1등 숙박권 40만원 · 2등 스타벅스 5천원 × 50명",
    stamp_cost: 5,
    icon: Dice5,
    stock: "월 1회 추첨",
  },
  {
    id: "voucher-10k",
    name: "1만원 상품권",
    description: "편의점·카페 어디든 사용",
    stamp_cost: 10,
    icon: ShoppingBag,
    stock: "주 20개",
  },
];

export default function MyStampsPage() {
  const { status, loading } = useMyStamps();

  function handleRedeem(r: RewardItem) {
    if (loading) return;
    if (status.current_count < r.stamp_cost) {
      toast.error(`스탬프가 ${r.stamp_cost - status.current_count}개 부족해요`);
      return;
    }
    toast.message("교환 시스템 준비 중이에요", {
      description: "곧 오픈됩니다. 지금은 스탬프를 모아두세요!",
    });
  }

  return (
    <div className="max-w-lg mx-auto bg-[#0B0A11] min-h-screen pb-24">
      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-[#0B0A11]/95 backdrop-blur-sm border-b border-neutral-800 flex items-center px-3 py-3">
        <Link
          href="/profile"
          className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-white text-[16px] font-black">내 스탬프</h1>
      </header>

      {/* 스탬프 잔량 카드 */}
      <div className="px-4 pt-4">
        <div className="bg-gradient-to-br from-red-500/20 via-neutral-900 to-neutral-900 border border-red-500/30 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <Ticket className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <div className="text-neutral-400 text-[12px] font-bold">사용 가능한 스탬프</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-white text-[36px] font-black leading-none">
                  {loading ? "—" : status.current_count}
                </span>
                <span className="text-neutral-500 text-[14px] font-bold">개</span>
              </div>
            </div>
          </div>
          {status.total_earned > 0 && (
            <div className="pt-3 border-t border-red-500/20 flex items-center justify-between text-[11px] text-neutral-500">
              <span>누적 적립 {status.total_earned}개</span>
              {status.earned_last_24h > 0 && (
                <span>오늘 {status.earned_last_24h}/7</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 안내 */}
      <div className="px-4 mt-5">
        <div className="rounded-2xl bg-neutral-900/50 border border-neutral-800 px-4 py-3">
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            <span className="text-white font-black">🎫 스탬프 모으는 법</span>
            <br />
            LIVE 게시 시 클럽 태그하면 스탬프 1개 지급
            <br />
            <span className="text-neutral-600">(30분 간격 · 하루 최대 7개)</span>
          </p>
        </div>
      </div>

      {/* 카탈로그 */}
      <div className="px-4 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-red-400" />
          <h2 className="text-white text-[15px] font-black">보상 카탈로그</h2>
        </div>
        <div className="space-y-2">
          {REWARDS.map((r) => {
            const Icon = r.icon;
            const enough = !loading && status.current_count >= r.stamp_cost;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0 text-neutral-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[14px] font-black leading-tight">
                      {r.name}
                    </div>
                    <div className="text-neutral-400 text-[11px] mt-0.5">
                      {r.description}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-black">
                        <Ticket className="w-3 h-3" />
                        {r.stamp_cost}
                      </span>
                      {r.stock && (
                        <span className="text-neutral-500 text-[10px]">{r.stock}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRedeem(r)}
                    disabled={loading}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-black transition-colors ${
                      enough
                        ? "bg-white text-black hover:bg-neutral-200"
                        : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    교환
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 안내 */}
      <div className="px-4 mt-8 mb-4">
        <p className="text-center text-[11px] text-neutral-600 leading-relaxed">
          🚧 교환 시스템 준비 중이에요
          <br />
          지금은 스탬프를 모아두세요. 곧 오픈됩니다.
        </p>
      </div>
    </div>
  );
}
