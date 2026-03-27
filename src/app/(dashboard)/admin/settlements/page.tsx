"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, Banknote, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

interface SettlementRow {
  id: string;
  md_id: string;
  md_name: string;
  total_sales: number;
  commission_amt: number;
  settlement_amt: number;
  bank_name: string;
  bank_account: string;
  status: string;
  note: string | null;
  created_at: string;
  transferred_at: string | null;
}

export default function AdminSettlementsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useCurrentUser();
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "transferred">("pending");

  useEffect(() => {
    if (!user) return;
    loadSettlements();
  }, [user, filter]);

  async function loadSettlements() {
    setLoading(true);

    // Admin 권한 확인
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user!.id)
      .single();

    if (userData?.role !== "admin") {
      router.push("/");
      return;
    }

    let query = supabase
      .from("settlement_logs")
      .select("*, md:md_id(name)")
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query = query.eq("status", "pending");
    } else if (filter === "transferred") {
      query = query.eq("status", "transferred");
    }

    const { data, error } = await query;

    if (error) {
      console.error("정산 조회 실패:", error);
      toast.error("정산 내역 조회에 실패했습니다");
    } else {
      setSettlements(
        (data || []).map((row: Record<string, unknown>) => ({
          ...row,
          md_name: (row.md as { name: string } | null)?.name || "알 수 없음",
        })) as SettlementRow[]
      );
    }

    setLoading(false);
  }

  async function markTransferred(id: string) {
    const { error } = await supabase
      .from("settlement_logs")
      .update({
        status: "transferred",
        transferred_at: new Date().toISOString(),
        admin_id: user!.id,
      })
      .eq("id", id);

    if (error) {
      toast.error("이체 완료 처리에 실패했습니다");
    } else {
      toast.success("이체 완료 처리되었습니다");
      loadSettlements();
    }
  }

  // 통계 계산
  const pendingCount = settlements.filter((s) => s.status === "pending").length;
  const pendingTotal = settlements
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + s.settlement_amt, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-4xl mx-auto px-6 space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </Link>
            <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
              <Banknote className="w-3.5 h-3.5" />
              Deposit Settlements
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">보증금 정산</h1>
          <p className="text-neutral-500 font-medium">
            보증금 정산 대기 내역을 확인하고 이체 완료 처리합니다.
          </p>
        </header>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4">
            <p className="text-[11px] text-neutral-500 font-bold uppercase">이체 대기</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{pendingCount}건</p>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4">
            <p className="text-[11px] text-neutral-500 font-bold uppercase">대기 금액</p>
            <p className="text-2xl font-black text-white mt-1">{formatPrice(pendingTotal)}</p>
          </Card>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2">
          {(["pending", "transferred", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                filter === f
                  ? "bg-white text-black"
                  : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {f === "pending" ? "이체 대기" : f === "transferred" ? "이체 완료" : "전체"}
            </button>
          ))}
        </div>

        {/* 정산 목록 */}
        {loading ? (
          <div className="text-center py-12 text-neutral-500">로딩 중...</div>
        ) : settlements.length === 0 ? (
          <div className="text-center py-12">
            <Banknote className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-500 font-bold">정산 내역이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlements.map((s) => (
              <Card
                key={s.id}
                className="bg-[#1C1C1E] border-neutral-800/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{s.md_name}</span>
                    <Badge
                      variant="outline"
                      className={
                        s.status === "pending"
                          ? "border-amber-500/30 text-amber-400"
                          : "border-green-500/30 text-green-400"
                      }
                    >
                      {s.status === "pending" ? (
                        <><Clock className="w-3 h-3 mr-1" />대기</>
                      ) : (
                        <><CheckCircle className="w-3 h-3 mr-1" />완료</>
                      )}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    {new Date(s.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold">보증금</p>
                    <p className="text-white font-bold">{formatPrice(s.total_sales)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold">PG 수수료</p>
                    <p className="text-red-400 font-bold">-{formatPrice(s.commission_amt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold">정산액</p>
                    <p className="text-green-400 font-black">{formatPrice(s.settlement_amt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-800/30">
                  <Banknote className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <p className="text-[11px] text-neutral-400 font-medium">
                    {s.bank_name} {s.bank_account}
                  </p>
                </div>

                {s.note && (
                  <p className="text-[10px] text-neutral-500 px-1">{s.note}</p>
                )}

                {s.status === "pending" && (
                  <Button
                    onClick={() => markTransferred(s.id)}
                    className="w-full h-10 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    이체 완료 처리
                  </Button>
                )}

                {s.transferred_at && (
                  <p className="text-[10px] text-green-500/70 text-right">
                    이체일: {new Date(s.transferred_at).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
