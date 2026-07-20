"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipientId: string;
  recipientName?: string | null;
  shotId?: string | null;
  currentUserId?: string;
  onRequireLogin?: () => void;
}

/**
 * 1:1 메시지 보내기 시트 — 유저 LIVE "나도 갈래" 진입.
 * 수락 게이트 없음(Migration 470): 첫 메시지 → 바로 대화 개설 → 그 스레드로 이동.
 */
export function DmRequestSheet({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  shotId,
  currentUserId,
  onRequireLogin,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    const body = text.trim();
    if (!body) {
      toast.message("메시지를 입력해주세요");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_dm", {
      p_recipient_id: recipientId,
      p_shot_id: shotId ?? null,
      p_first_message: body,
    });
    setSending(false);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("blocked")) {
        toast.error("차단된 상대예요");
      } else if (msg.includes("cannot_dm_self")) {
        toast.error("본인에게는 보낼 수 없어요");
      } else if (msg.includes("42P01") || msg.includes("does not exist")) {
        toast.error("DM 마이그레이션 미적용 (470)");
      } else {
        toast.error("전송에 실패했어요");
      }
      return;
    }
    onOpenChange(false);
    setText("");
    toast.success("메시지를 보냈어요");
    if (data) router.push(`/dm/${data}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl p-0 pb-6"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-white text-[16px] text-left">
            {recipientName ? `${recipientName}님에게 메시지` : "메시지 보내기"}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 space-y-3">
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            바로 1:1 대화가 시작돼요. 첫 메시지로 자연스럽게 말 걸어보세요.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="저도 갈래요! 지금 어디세요?"
            rows={3}
            className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-2xl px-3 py-2.5 text-white text-[15px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={sending || !text.trim()}
            className="w-full py-3 rounded-full bg-amber-500 text-black text-[15px] font-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
          >
            {sending ? "보내는 중..." : "보내기"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
