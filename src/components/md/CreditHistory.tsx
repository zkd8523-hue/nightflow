"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";

interface CreditPaymentRow {
  id: string;
  created_at: string;
  credits: number;
  amount: number;
  status: string;
  method: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * MD 크레딧 충전 내역 — 본인 credit_payments 조회(RLS: 본인만). 펼치기/접기 가능.
 * 계좌이체 신청(pending=확인중) / 적립완료(paid) / 취소(cancelled·failed) 상태 표시.
 */
export function CreditHistory({ userId }: { userId: string }) {
  const [rows, setRows] = useState<CreditPaymentRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();

    async function load() {
      const { data } = await supabase
        .from("credit_payments")
        .select("id, created_at, credits, amount, status, method")
        .eq("md_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (alive) setRows((data as CreditPaymentRow[]) ?? []);
    }
    load();

    // 관리자 적립 시 상태(pending→paid)가 실시간 반영되도록 구독
    const channel = supabase
      .channel(`credit_payments:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_payments", filter: `md_id=eq.${userId}` },
        () => load()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1 py-1"
      >
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          충전 내역
          {rows && rows.length > 0 && (
            <span className="ml-1 text-muted-foreground/70">{rows.length}</span>
          )}
        </h3>
        {pendingCount > 0 && (
          <span className="text-[10px] font-black text-brand-amber bg-amber-500/10 px-1.5 py-0.5 rounded-full">
            확인중 {pendingCount}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        (rows === null ? (
          <p className="text-[12px] text-muted-foreground px-1 py-4">불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground px-1 py-4">아직 충전 내역이 없습니다.</p>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{row.credits}크레딧</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(row.created_at)} · {row.method === "bank_transfer" ? "계좌이체" : "카드"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-foreground">{formatPrice(row.amount)}</span>
                  <StatusBadge status={row.status} />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "확인중", className: "text-brand-amber bg-amber-500/10" },
    paid: { label: "완료", className: "text-green-500 bg-green-500/10" },
    cancelled: { label: "취소", className: "text-muted-foreground bg-muted" },
    failed: { label: "실패", className: "text-muted-foreground bg-muted" },
  };
  const s = map[status] ?? { label: status, className: "text-muted-foreground bg-muted" };
  return (
    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${s.className}`}>
      {s.label}
    </span>
  );
}
