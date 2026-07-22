"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, X, Clock } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

interface MdRef {
  id: string;
  name: string | null;
  display_name: string | null;
  phone: string | null;
}

export interface BankCreditRow {
  id: string;
  payment_id: string;
  credits: number;
  amount: number;
  depositor_name: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
  md: MdRef | null;
}

function mdName(md: MdRef | null): string {
  if (!md) return "알 수 없음";
  return (
    (md.name && md.name.trim()) ||
    (md.display_name && md.display_name.trim()) ||
    md.phone ||
    "이름없음"
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BankCreditManager({
  pending,
  recent,
  highlightId,
}: {
  pending: BankCreditRow[];
  recent: BankCreditRow[];
  highlightId: string | null;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  async function resolve(row: BankCreditRow, action: "confirm" | "reject") {
    if (busyId) return;
    if (action === "reject" && !confirm("이 신청을 반려하시겠어요?")) return;
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/credits/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: row.payment_id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      toast.success(
        action === "confirm"
          ? `${row.credits}크레딧을 적립했습니다.`
          : "신청을 반려했습니다."
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* 대기 목록 */}
      <section>
        <h2 className="text-sm font-black text-foreground mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-amber" />
          입금확인 대기
          <span className="text-muted-foreground font-bold">{pending.length}</span>
        </h2>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center rounded-2xl bg-card border border-border">
            대기 중인 입금 신청이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => {
              const isTarget = row.id === highlightId;
              return (
                <div
                  key={row.id}
                  ref={isTarget ? highlightRef : undefined}
                  className={`rounded-2xl border p-4 transition-colors ${
                    isTarget
                      ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/40"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-black text-foreground truncate">
                        {row.depositor_name || "(입금자명 없음)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mdName(row.md)} · {fmtTime(row.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-brand-amber">{formatPrice(row.amount)}</p>
                      <p className="text-xs text-muted-foreground">{row.credits}크레딧</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => resolve(row, "reject")}
                      disabled={busyId === row.id}
                      className="rounded-full border border-border bg-background text-muted-foreground font-bold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      반려
                    </button>
                    <button
                      onClick={() => resolve(row, "confirm")}
                      disabled={busyId === row.id}
                      className="rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      적립
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 최근 처리 이력 */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-black text-foreground mb-3">최근 처리</h2>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {recent.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {row.depositor_name || mdName(row.md)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {mdName(row.md)} · {fmtTime(row.paid_at ?? row.created_at)}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{row.credits}크레딧</span>
                  <StatusBadge status={row.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="text-[11px] font-black text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
        적립완료
      </span>
    );
  }
  return (
    <span className="text-[11px] font-black text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
      반려
    </span>
  );
}
