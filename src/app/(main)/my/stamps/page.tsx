"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ticket, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useMyStamps } from "@/hooks/useMyStamps";

/**
 * 스탬프 → 보상 교환 페이지 (Migration 413 my_stamp_status)
 * 1차 출시: 카탈로그 하드코딩. 교환 버튼은 "준비 중" 안내.
 * 실제 카탈로그/교환 RPC는 후속 마이그레이션(414+)에서 도입.
 */

interface RaffleTier {
  rank: string; // "1등", "2등"
  label: string;
  image: string;
}

interface RewardItem {
  id: string;
  name: string;
  description?: string;
  stamp_cost: number;
  image: string; // /public/rewards/*.png|jpg
  stock?: string; // "재고 3" 등 표시용
  raffleTiers?: RaffleTier[]; // 추첨형이면 등수별 구분 UI
}

// 1차 오픈 카탈로그 (2/5/10 스탬프 티어)
const REWARDS: RewardItem[] = [
  {
    id: "chocoemong",
    name: "GS25 초코에몽",
    stamp_cost: 2,
    image: "/rewards/chocoemong.jpg",
    stock: "주 100개 선착순",
  },
  {
    id: "voucher-10k",
    name: "GS25 1만원 상품권",
    stamp_cost: 10,
    image: "/rewards/gs25.png",
    stock: "주 20개",
  },
  {
    id: "raffle",
    name: "월간 추첨 응모",
    stamp_cost: 5,
    image: "/rewards/yeogi-hotel.png",
    stock: "월 1회 추첨",
    raffleTiers: [
      { rank: "1등", label: "여기어때 숙박권 40만원", image: "/rewards/yeogi-hotel.png" },
      { rank: "2등", label: "스타벅스 아메리카노 × 50명", image: "/rewards/starbucks.jpg" },
    ],
  },
];

export default function MyStampsPage() {
  const router = useRouter();
  const { status, loading } = useMyStamps();
  // 이번 달 추첨 응모 횟수 — 교환 시스템(redemptions) 붙기 전까진 0.
  // 추후 my_stamp_status 뷰 또는 redemptions 조회로 연동.
  const raffleEntries = 0;

  function handleBack() {
    // 직전 페이지로 복귀 (와글에서 왔으면 와글로). 히스토리 없으면 /profile.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/profile");
    }
  }

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
        <button
          type="button"
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
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
        <div className="space-y-2.5">
          {REWARDS.map((r) => {
            const enough = !loading && status.current_count >= r.stamp_cost;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-3.5 transition-colors"
              >
                <div className={`flex gap-3 ${r.raffleTiers ? "items-start" : "items-center"}`}>
                  {!r.raffleTiers && (
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white shrink-0">
                      <Image
                        src={r.image}
                        alt={r.name}
                        fill
                        sizes="48px"
                        className="object-contain p-1"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[14px] font-black leading-tight">
                      {r.name}
                    </div>
                    {r.description && (
                      <div className="text-neutral-500 text-[11.5px] mt-1 leading-tight">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRedeem(r)}
                      disabled={loading}
                      className={`px-3.5 py-1.5 rounded-full text-[12px] font-black whitespace-nowrap transition-colors ${
                        enough
                          ? "bg-white text-black hover:bg-neutral-200"
                          : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {r.stamp_cost}장 {r.raffleTiers ? "추첨" : "교환"}
                    </button>
                    {r.stock && (
                      <span className="text-neutral-500 text-[10px]">{r.stock}</span>
                    )}
                  </div>
                </div>

                {/* 추첨형: 등수별 상품 구분 UI */}
                {r.raffleTiers && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-800 space-y-2.5">
                    {r.raffleTiers.map((tier) => (
                      <div key={tier.rank} className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white shrink-0">
                          <Image
                            src={tier.image}
                            alt={tier.rank}
                            fill
                            sizes="40px"
                            className="object-contain p-0.5"
                          />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-black">
                            {tier.rank}
                          </span>
                          <span className="text-neutral-300 text-[12.5px] font-bold truncate">
                            {tier.label}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* 확률 안내 + 내 응모 횟수 */}
                    <div className="mt-0.5 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold">
                        <TrendingUp className="w-3.5 h-3.5" />
                        많이 응모할수록 당첨 확률 ↑
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        내 응모{" "}
                        <span className="text-white font-black">{raffleEntries}</span>회
                      </div>
                    </div>
                  </div>
                )}
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
