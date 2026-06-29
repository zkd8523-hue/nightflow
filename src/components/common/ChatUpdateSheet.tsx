"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";

// 인앱 채팅 도입 안내 (1회). 대상: MD/관리자 또는 깃발 보유 방장.
const SEEN_KEY = "nf_chat_update_v1_seen";

export function ChatUpdateSheet() {
  const { user, isLoading } = useCurrentUser();
  const chatOn = useOfferChatFlag();
  const [open, setOpen] = useState(false);

  const isMd = user?.role === "md" || user?.role === "admin";

  useEffect(() => {
    if (isLoading || !user || !chatOn) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_KEY) === "true") return;
    setOpen(true);
  }, [user, isLoading, chatOn]);

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(SEEN_KEY, "true");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl sm:max-w-lg sm:mx-auto p-5 gap-0"
      >
        <SheetHeader className="text-left mb-3 space-y-0">
          <SheetTitle className="text-white font-black text-[16px] flex items-center gap-1.5">
            <MessageCircle className="w-[18px] h-[18px] text-amber-400 shrink-0" />
            오퍼 수락 방식이 변경됐어요!
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-2 text-[13px] text-neutral-300 leading-snug">
          {isMd ? (
            <>
              <ul className="space-y-1 text-neutral-400">
                <li>· 이제 오퍼에 관심있는 방장이 <strong className="text-white">채팅을 신청</strong>해요</li>
                <li>· 첫 답장에 <strong className="text-amber-400">15크레딧</strong> (매치당 1회)</li>
                <li>· 수락은 무료</li>
              </ul>
              <p className="font-bold text-amber-400">
                💰 매치당 비용이 50% 줄었어요 (30 → 15)
              </p>
            </>
          ) : (
            <>
              <p className="text-white font-bold">
                이제 더 자유롭게, 더 많이 상담해보고 결정할 수 있어요.
              </p>
              <ul className="space-y-1 text-neutral-400">
                <li>· 관심있는 오퍼에 <strong className="text-white">대화하기</strong> (깃발당 3개까지)</li>
                <li>· 상담해보고 마음에 들면 <strong className="text-white">수락</strong></li>
              </ul>
            </>
          )}
        </div>

        <Button
          onClick={dismiss}
          className="w-full h-11 bg-white text-black font-black rounded-2xl mt-4 hover:bg-neutral-200"
        >
          확인했어요
        </Button>
      </SheetContent>
    </Sheet>
  );
}
