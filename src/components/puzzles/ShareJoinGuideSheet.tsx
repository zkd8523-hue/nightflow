"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * variant는 두 가지다. 파티를 연 주체가 다르면 유저가 겪는 흐름 자체가 달라진다.
 *   direct — 파트너가 연 파티(클럽 다이렉트). 오퍼가 없다. 인원을 모으고 자리를
 *            굴리는 주체가 파트너라, 유저는 고르고 합류하기만 하면 된다.
 *   party  — 유저가 연 파티. 파트너들이 시크릿오퍼를 보내고, 파티장이 골라야 한다.
 * party에서 이 설명이 없으면 합류자는 어느 날 갑자기 모르는 파트너가 단톡방에
 * 들어온 걸 보게 된다.
 */
export function ShareJoinGuideSheet({
  manualOpen = false,
  onManualClose,
  variant = "direct",
}: {
  /** "ⓘ 파티란?"처럼 직접 열 때 — 계정 플래그를 소모하지 않는다 */
  manualOpen?: boolean;
  onManualClose?: () => void;
  variant?: "direct" | "party";
} = {}) {
  const { user, isLoading, refetch } = useCurrentUser();
  const [open, setOpen] = useState(false);
  // 한 번 닫으면 이 세션에서는 끝. DB 기록이 늦거나 실패해도 다시 열리면 안 된다.
  // store 의 user 객체는 포커스 복귀 등으로 새로 만들어져 아래 effect 를 다시 태운다.
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (manualOpen) { setOpen(true); return; }
    if (dismissedRef.current) return;
    // 비로그인은 대상이 아니다 — 참가하려면 어차피 로그인 화면을 거친다.
    if (isLoading || !user) return;
    if (user.share_join_guide_seen) return;
    setOpen(true);
  }, [user, isLoading, manualOpen]);

  const dismiss = async () => {
    setOpen(false);
    // 직접 열어본 것은 "안내를 봤다"로 기록하지 않는다
    if (manualOpen) { onManualClose?.(); return; }
    dismissedRef.current = true;
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ share_join_guide_seen: true })
      .eq("id", user.id);
    // 조용히 삼키면 "닫았는데 다음에 또 뜬다"로만 드러난다 — 원인을 남긴다
    if (error) {
      console.error("[ShareJoinGuideSheet] 안내 확인 기록 실패:", error.message);
      return;
    }
    refetch();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-background border-border rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pt-5 pb-5"
      >
        <SheetHeader className="text-left p-0 gap-0 mb-2.5">
          <SheetTitle className="text-foreground text-[19px] font-black tracking-tight leading-tight">
            혼자 와도 <span className="text-brand-amber text-[23px]">크게 놀 수 있어요</span> 🎉
          </SheetTitle>
        </SheetHeader>

        {(variant === "party"
          ? [
              { n: "1", title: "마음에 드는 파티에 합류", desc: "날짜·인원·가격을 보고 골라요" },
              { n: "2", title: "파티에서 상의하여 오퍼를 선택!", desc: "마음에 드는 오퍼를 골라요." },
              { n: "3", title: "채팅방에 파트너가 초대돼요", desc: "상담을 시작해봐요!" },
            ]
          : [
              { n: "1", title: "마음에 드는 자리 고르기", desc: "날짜·인원·가격이 다른 자리를 골라요" },
              { n: "2", title: "파트너가 인원을 모아줘요", desc: "자리 구성부터 당일 진행까지 파트너가 맡아요" },
              { n: "3", title: "계산은 현장에서", desc: "나플에서는 결제가 없어요" },
            ]
        ).map((x) => (
          <div key={x.n} className="bg-card border border-border rounded-2xl p-3 mb-2">
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

        <p className="mt-2.5 text-center text-[12.5px] font-black text-brand-amber">
          언제든 나갈 수 있어요
        </p>

        {/* 직접 열어본 설명일 땐 행동을 유도하지 않는다 — 이미 파티 화면에 참가 버튼이 있다 */}
        <button
          type="button"
          onClick={dismiss}
          className="w-full h-12 mt-2.5 rounded-xl bg-inverse text-inverse-foreground font-black text-[14px] active:scale-95 transition-transform"
        >
          {manualOpen ? "확인" : "참가할게요"}
        </button>
        {!manualOpen && (
          <button
            type="button"
            onClick={dismiss}
            className="w-full mt-2 text-center text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
          >
            다시 보지 않기
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
