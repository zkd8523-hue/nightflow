"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Copy, Package } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export interface PersonAgg {
  userId: string;
  name: string;
  phone: string | null;
  count: number;
  ids: string[];
  latestAt: string;
}

export interface RewardGroup {
  rewardName: string;
  total: number;
  people: PersonAgg[];
}

/**
 * 어드민 발행 워크리스트 (Migration 418)
 * 상품별 그룹 → 사람별(이름·전화번호·개수). 전화번호 복사 + 지급완료/취소·환불.
 * 전화번호로 상품(기프티콘 등)을 직접 발송하는 운영 흐름에 맞춤.
 */
export function RedemptionWorklist({ groups }: { groups: RewardGroup[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function act(ids: string[], action: "fulfill" | "cancel", key: string) {
    if (busyKey) return;
    if (action === "cancel" && typeof window !== "undefined") {
      if (!window.confirm(`${ids.length}건을 취소하고 스탬프를 환불할까요?`)) return;
    }
    const note =
      typeof window !== "undefined"
        ? window.prompt(action === "fulfill" ? "처리 메모 (기프티콘 코드 등, 선택)" : "취소 사유 (선택)")
        : null;

    setBusyKey(key);
    try {
      const supabase = createClient();
      const fn = action === "fulfill" ? "fulfill_redemption" : "cancel_redemption_with_refund";
      let okCount = 0;
      for (const id of ids) {
        const { error } = await supabase.rpc(fn, { p_id: id, p_note: note || null });
        if (error) {
          toast.error(`실패(${okCount}/${ids.length}): ${error.message}`);
          break;
        }
        okCount++;
      }
      if (okCount > 0) {
        toast.success(
          `${okCount}건 ${action === "fulfill" ? "지급완료" : "취소·환불"} 처리됨`
        );
        router.refresh();
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("전화번호 복사됨");
    } catch {
      toast.error("복사 실패");
    }
  }

  if (groups.length === 0) return null;

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.rewardName} className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] overflow-hidden">
          {/* 상품 헤더 */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-[14px] font-black text-white truncate">{g.rewardName}</h3>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-black">
              {g.total}개 · {g.people.length}명
            </span>
          </div>

          {/* 사람별 */}
          <div className="divide-y divide-neutral-800/70">
            {g.people.map((p) => {
              const key = `${g.rewardName}:${p.userId}`;
              const busy = busyKey === key;
              return (
                <div key={p.userId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-white truncate">{p.name}</span>
                        {p.count > 1 && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/10 text-white text-[11px] font-black">
                            ×{p.count}
                          </span>
                        )}
                      </div>
                      {/* 전화번호 — 발송 대상, 복사 가능 */}
                      {p.phone ? (
                        <button
                          type="button"
                          onClick={() => copyPhone(p.phone!)}
                          className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-black text-green-400 tabular-nums hover:text-green-300"
                        >
                          {p.phone}
                          <Copy className="w-3 h-3 opacity-60" />
                        </button>
                      ) : (
                        <div className="mt-1 text-[12px] text-neutral-600">전화번호 없음</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => act(p.ids, "fulfill", key)}
                        disabled={!!busyKey}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-[12px] font-black hover:bg-green-500/25 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        지급완료
                      </button>
                      <button
                        type="button"
                        onClick={() => act(p.ids, "cancel", key)}
                        disabled={!!busyKey}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-50"
                        aria-label="취소·환불"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
