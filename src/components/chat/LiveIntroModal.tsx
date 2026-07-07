"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const STORAGE_KEY = "wagle.liveIntro.seen.v1";

/**
 * 와글 첫 진입 시 LIVE + 스탬프 안내 1회 팝업.
 * localStorage에 seen 플래그 저장 후 재방문 시 안 뜸.
 */
export function LiveIntroModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        // 페이지 렌더링 직후 잠깐 지연 (레이아웃 안정)
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

  function handleGoRewards() {
    handleClose();
    router.push("/my/stamps");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="bg-[#0B0A11] border-neutral-800 rounded-3xl max-w-sm p-0 overflow-hidden [&>button]:hidden"
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
              지금 분위기를 공유해요! 🎉
            </h2>
            <p className="text-neutral-300 text-[13px] leading-relaxed">
              어디 갈지 고민하는 친구들에게 도움이 돼요
            </p>
          </div>

          <p className="text-[15px] font-bold text-neutral-200 leading-relaxed text-center">
            공유로 쌓은 스탬프를 다양한 보상으로 교환!
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoRewards}
              className="w-full flex items-center justify-center gap-0.5 text-neutral-400 text-[12px] font-bold hover:text-white transition-colors"
            >
              상품 보러가기
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 rounded-full bg-white text-black text-[14px] font-black hover:bg-neutral-200 transition-colors"
            >
              시작하기
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
