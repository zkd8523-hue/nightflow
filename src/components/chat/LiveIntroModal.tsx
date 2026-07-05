"use client";

import { useEffect, useState } from "react";
import { Zap, Ticket, Clock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const STORAGE_KEY = "wagle.liveIntro.seen.v1";

/**
 * 와글 첫 진입 시 LIVE + 스탬프 안내 1회 팝업.
 * localStorage에 seen 플래그 저장 후 재방문 시 안 뜸.
 */
export function LiveIntroModal() {
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="bg-[#0B0A11] border-neutral-800 rounded-3xl max-w-sm p-0 overflow-hidden [&>button]:hidden"
      >
        {/* 헤더 아이콘 영역 */}
        <div className="relative bg-gradient-to-b from-red-500/20 to-transparent pt-8 pb-4 px-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500 text-white text-[12px] font-black">
            <Zap className="w-3.5 h-3.5 fill-white" />
            LIVE
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 pb-6 space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-white text-[18px] font-black leading-tight">
              지금 이 순간을 담아 공유해요
            </h2>
            <p className="text-neutral-300 text-[13px] leading-relaxed">
              다른 사람이 오늘 갈 곳을<br />정하는 데 도움이 돼요
            </p>
            <p className="text-neutral-500 text-[11px] flex items-center justify-center gap-1 pt-1">
              <Clock className="w-3 h-3" />
              12시간 후 자연스럽게 사라져요
            </p>
          </div>

          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <Ticket className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
              <div>
                <div className="text-white text-[14px] font-black">
                  클럽 태그 시<br />스탬프 1개 지급
                </div>
                <div className="text-red-300/80 text-[11px] mt-1">
                  30분 간격, 하루 최대 7개
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-red-500/20">
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                스탬프는 MY페이지에서
                <br />다양한 보상으로 교환할 수 있어요
              </p>
            </div>
          </div>

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
