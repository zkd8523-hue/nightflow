"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * 유저 조각 안내 — 조각 상세 첫 진입 1회.
 *
 * "지금 결제되는 건가?"는 참가 버튼을 누르기 전부터 시작된다. 자리를 훑어보는 동안
 * 미리 풀어줘야 마지막 버튼에서 멈추지 않는다(Model B — 앱에서 돈이 오가지 않음).
 *
 * 노출 여부는 계정 단위(users.share_join_guide_seen, Migration 523)로 저장한다.
 */
export function ShareJoinGuideSheet() {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 비로그인은 대상이 아니다 — 참가하려면 어차피 로그인 화면을 거친다.
    if (isLoading || !user) return;
    if (user.share_join_guide_seen) return;
    setOpen(true);
  }, [user, isLoading]);

  const dismiss = async () => {
    setOpen(false);
    if (!user) return;
    const supabase = createClient();
    await supabase.from("users").update({ share_join_guide_seen: true }).eq("id", user.id);
    refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pt-6 pb-7"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-4">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            나플에서는 <span className="text-brand-amber text-[23px]">결제가 없어요</span> 🧩
          </SheetTitle>
        </SheetHeader>

        {[
          { n: "1", title: "마음에 드는 자리를 고르기", desc: "가격·인원이 다른 자리를 비교해서 선택" },
          { n: "2", title: "단체채팅에서 자유롭게!", desc: "파티원들과 의견을 맞춰요" },
          { n: "3", title: "계산은 현장에서", desc: null },
        ].map((x) => (
          <div key={x.n} className="bg-card border border-border rounded-2xl p-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 w-6 h-6 rounded-full bg-green-500/15 text-green-500 text-[11px] font-black flex items-center justify-center">
                {x.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-black text-foreground">{x.title}</p>
                {x.desc && (
                  <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{x.desc}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-3 text-center text-[12.5px] font-black text-brand-amber">
          언제든 나갈 수 있어요
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-4 rounded-xl bg-inverse text-inverse-foreground font-black text-[14px] active:scale-95 transition-transform"
        >
          참가할게요
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-full mt-2.5 text-center text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
        >
          다시 보지 않기
        </button>
      </SheetContent>
    </Sheet>
  );
}
