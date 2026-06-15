"use client";

import { useState } from "react";
import { ChevronRight, ArrowUp } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SharePreviewSheet } from "./SharePreviewSheet";

/**
 * MD/admin에게만 노출되는 조각(share) 행동 유도 띠.
 * 클릭 시 SharePreviewSheet(조각이 어떻게 채워지는지 미리보기)를 띄운다.
 * (게스트 간판 GuestSignMdCta와 동일 패턴)
 */
export function ShareMdCta() {
  const { user, isLoading } = useCurrentUser();
  const [previewOpen, setPreviewOpen] = useState(false);

  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  if (isLoading) return null;
  if (!isMdOrAdmin) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-amber-500/15 border border-amber-500/40 active:scale-[0.99] transition-transform text-left"
      >
        <ArrowUp className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
        <p className="text-[12.5px] font-bold leading-snug flex-1 text-amber-50">
          클럽당 1명만 <span className="text-amber-400">조각</span>을 올릴 수 있어요. <span className="text-amber-200/60 font-medium">(선착순 마감)</span>
        </p>
        <ChevronRight className="w-4 h-4 shrink-0 text-amber-400" />
      </button>
      <SharePreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}
