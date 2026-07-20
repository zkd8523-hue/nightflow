"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const STORAGE_KEY = "wagle.liveIntro.seen.v1";

/**
 * 와글 첫 진입 시 LIVE 안내 1회 팝업.
 * localStorage에 seen 플래그 저장 후 재방문 시 안 뜸.
 */
export function LiveIntroModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const t = setTimeout(() => setOpen(true), 300);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage 접근 실패 시 안내 skip */
    }
  }, []);

  function handleClose() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* 저장 실패 시 다음번 다시 뜸 — 무해 */
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="bg-[#0A0A0A] border-neutral-800 rounded-3xl max-w-sm p-0 overflow-hidden [&>button]:hidden"
      >
        <DialogTitle className="sr-only">LIVE 안내</DialogTitle>
        {/* 헤더 아이콘 영역 */}
        <div className="relative bg-gradient-to-b from-red-500/20 to-transparent pt-5 pb-2 px-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500 text-white text-[12px] font-black">
            <Zap className="w-3.5 h-3.5 fill-white" />
            LIVE
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 pb-6 space-y-4">
          <div className="text-center space-y-1.5">
            <h2 className="text-white text-[18px] font-black leading-tight">
              지금 이 순간을 공유해요! 🎉
            </h2>
            <p className="text-neutral-300 text-[13px] leading-relaxed">
              어디 갈지 고민하는 친구들에게 도움이 돼요
            </p>
          </div>

          <p className="text-[15px] font-bold text-neutral-200 leading-relaxed text-center">
            실시간 분위기를 올리면, 사람들이 찾아와요 🔥
          </p>

          <button
            type="button"
            onClick={handleClose}
            className="w-full py-3 rounded-full bg-white text-black text-[14px] font-black hover:bg-neutral-200 transition-colors"
          >
            시작하기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
