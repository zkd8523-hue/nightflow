"use client";

import { Zap, ChevronRight } from "lucide-react";

interface Props {
  percent: number;
  missing: string[];
  onClick: () => void;
}

/**
 * 파트너 MD가 본인 클럽 진입 시 노출되는 작성 유도 amber 배너.
 * 완성도 < 100% 일 때만 렌더링 (호출부에서 가드).
 */
export function ClubMdProfileBanner({ percent, missing, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-amber-500/15 border border-amber-500/40 active:scale-[0.99] transition-transform text-left"
    >
      <Zap className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[12.5px] font-bold text-amber-50">
            이 클럽 정보를 보강해주세요
          </p>
          <span className="text-[11px] font-black text-amber-300 tabular-nums">
            {percent}%
          </span>
        </div>
        {missing.length > 0 && (
          <p className="text-[11px] text-amber-200/80 truncate mt-0.5">
            {missing.join(" · ")} 비어있어요
          </p>
        )}
        {/* 진행률 게이지 */}
        <div className="mt-2 h-1 bg-amber-500/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 text-amber-400" />
    </button>
  );
}
