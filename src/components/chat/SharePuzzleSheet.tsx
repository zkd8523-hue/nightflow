"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import dayjs from "dayjs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";
import type { Puzzle } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  /** 고른 조각을 입력창 첨부로 넘긴다 (사진 첨부와 동일한 동선) */
  onSelect: (puzzle: Puzzle) => void;
}

/**
 * "내 조각" 고르기 시트 — 와글 입력창 + 메뉴에서 진입.
 * 여기서 바로 보내지 않고 입력창 첨부로 넘긴다. 사진 첨부와 같은 감각으로
 * 한마디 적어서 함께 보낼 수 있다. 전송은 ChatRoom이 담당 (Migration 471).
 */
export function SharePuzzleSheet({ open, onOpenChange, userId, onSelect }: Props) {
  const router = useRouter();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("puzzles")
        .select("*")
        .eq("leader_id", userId)
        .eq("is_recruiting_party", true)
        .in("status", ["open", "selecting"])
        .is("leader_hidden_at", null)
        .order("event_date", { ascending: true });
      if (cancelled) return;
      setPuzzles((data ?? []) as Puzzle[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl p-0 pb-6 max-h-[70vh] overflow-y-auto"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-foreground text-[16px] text-left">내 파티 공유</SheetTitle>
        </SheetHeader>
        <p className="px-4 text-[12px] text-muted-foreground mb-3">
          고르면 입력창에 붙어요. 한마디 적어서 같이 보내세요.
        </p>

        <div className="px-4 space-y-2">
          {loading ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">불러오는 중...</p>
          ) : puzzles.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-3">
              <p className="text-[13px] text-muted-foreground">모집 중인 파티가 없어요</p>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/shares/new");
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-inverse text-inverse-foreground text-[13px] font-black"
              >
                <Plus className="w-4 h-4" />
                파티 만들기
              </button>
            </div>
          ) : (
            puzzles.map((p) => {
              const perPerson =
                p.total_budget != null && p.target_count > 0
                  ? Math.round(p.total_budget / p.target_count)
                  : p.budget_per_person;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    onOpenChange(false);
                  }}
                  className="w-full text-left rounded-2xl border border-border bg-card p-3.5 hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground text-[14px] font-black truncate">
                      {dayjs(p.event_date).format("M/D")} · {p.area} ·{" "}
                      {formatPrice(perPerson)}/인
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {p.current_count}/{p.target_count}명 모집 중
                  </p>
                </button>
              );
            })
          )}
        </div>

      </SheetContent>
    </Sheet>
  );
}
