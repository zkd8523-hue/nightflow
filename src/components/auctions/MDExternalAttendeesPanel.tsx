"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Auction } from "@/types/database";
import { Users, Minus, Plus, Loader2 } from "lucide-react";

interface MDExternalAttendeesPanelProps {
  auction: Auction;
}

export function MDExternalAttendeesPanel({ auction }: MDExternalAttendeesPanelProps) {
  const supabase = createClient();
  const [count, setCount] = useState(auction.external_attendees ?? 0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const nfClaimed = auction.seats_claimed ?? 0;
  const totalSeats = auction.total_seats ?? 0;
  const maxExternal = totalSeats - nfClaimed;
  const totalFilled = nfClaimed + count;

  useEffect(() => {
    setCount(auction.external_attendees ?? 0);
    setDirty(false);
  }, [auction.external_attendees]);

  const decrement = () => {
    if (count > 0) {
      setCount((c) => c - 1);
      setDirty(true);
    }
  };

  const increment = () => {
    if (count < maxExternal) {
      setCount((c) => c + 1);
      setDirty(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("md_update_external_attendees", {
        p_auction_id: auction.id,
        p_count: count,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(
          data?.error === "EXCEEDS_TOTAL_SEATS"
            ? "정원을 초과할 수 없습니다."
            : "저장 중 문제가 발생했습니다."
        );
        return;
      }
      setDirty(false);
      toast.success("외부 인원이 업데이트되었습니다.");
    } catch {
      toast.error("네트워크 연결이 불안정합니다.");
    } finally {
      setSaving(false);
    }
  };

  const isCompleted = ["unsold", "won", "confirmed", "cancelled"].includes(auction.status);

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-brand-amber" />
        <h3 className="text-sm font-semibold text-foreground">외부에서 인원을 추가했어요</h3>
      </div>

      {/* 현황 */}
      <div className="bg-card rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">NightFlow 참여</span>
          <span className="text-foreground font-semibold">{nfClaimed}명</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">외부 (DM/카페)</span>
          <span className="text-brand-amber font-semibold">{count}명</span>
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-bold">
          <span className="text-foreground/80">합계</span>
          <span className={`${totalFilled >= totalSeats ? "text-brand-amber" : "text-foreground"}`}>
            {totalFilled}/{totalSeats}명
          </span>
        </div>

        {/* 진행 바 */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-300"
            style={{ width: `${totalSeats > 0 ? Math.min(100, (totalFilled / totalSeats) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* 카운터 */}
      <div className="flex items-center justify-center gap-6">
        <Button
          variant="outline"
          size="icon"
          className="w-12 h-12 rounded-full border-border bg-card hover:bg-muted text-foreground"
          onClick={decrement}
          disabled={count <= 0 || isCompleted}
        >
          <Minus className="w-5 h-5" />
        </Button>
        <span className="text-4xl font-bold text-foreground w-12 text-center tabular-nums">
          {count}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="w-12 h-12 rounded-full border-border bg-card hover:bg-muted text-foreground"
          onClick={increment}
          disabled={count >= maxExternal || isCompleted}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {maxExternal <= 0 && !isCompleted && (
        <p className="text-xs text-muted-foreground text-center">
          NightFlow 참여자로 정원이 가득 찼습니다.
        </p>
      )}

      {/* 저장 버튼 */}
      <Button
        className="w-full h-12 rounded-2xl font-bold text-base bg-inverse text-inverse-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
        onClick={handleSave}
        disabled={!dirty || saving}
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "저장"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        {isCompleted
          ? "마감된 매물의 최종 인원을 기록할 수 있습니다."
          : "외부 인원이 반영되면 유저 화면에 즉시 갱신됩니다."}
      </p>
    </div>
  );
}
