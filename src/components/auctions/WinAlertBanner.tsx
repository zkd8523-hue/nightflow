"use client";

import { usePathname, useRouter } from "next/navigation";
import { useActiveWins } from "@/hooks/useActiveWins";
import { useCountdown } from "@/hooks/useCountdown";
import { PartyPopper, AlertTriangle, Clock } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 글로벌 낙찰 알림 배너
 *
 * 활성 낙찰(status='won', contact_deadline 미만료)이 있을 때
 * 화면 하단에 고정 배너를 표시합니다.
 * /bids, /auctions/* 페이지에서는 기존 연락 UI가 있으므로 미표시.
 */
export function WinAlertBanner() {
  const { mostUrgent, activeWins } = useActiveWins();
  const pathname = usePathname();
  const router = useRouter();

  // 이미 전용 연락 UI가 있는 페이지에서는 미표시
  const isExcludedRoute =
    pathname.startsWith("/bids") || pathname.startsWith("/auctions/");

  if (!mostUrgent || isExcludedRoute) return null;

  return (
    <BannerContent
      win={mostUrgent}
      extraCount={activeWins.length - 1}
      onClick={() => router.push("/bids?tab=won")}
    />
  );
}

function BannerContent({
  win,
  extraCount,
  onClick,
}: {
  win: { id: string; contact_deadline: string; club: { name: string } | null };
  extraCount: number;
  onClick: () => void;
}) {
  const { remaining, level } = useCountdown(win.contact_deadline);
  const clubName = win.club?.name || "클럽";

  // 타이머 만료 시 배너 숨김 (다음 폴링에서 제거됨)
  if (remaining <= 0) return null;

  const styles = {
    normal: {
      bg: "bg-amber-500",
      text: "text-black",
      icon: <PartyPopper className="w-4 h-4 shrink-0" />,
      label: `${clubName} 낙찰!`,
      cta: "연락하기",
      pulse: false,
    },
    warning: {
      bg: "bg-red-500",
      text: "text-white",
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
      label: `${clubName} 마감 임박!`,
      cta: "지금 연락",
      pulse: false,
    },
    critical: {
      bg: "bg-red-600",
      text: "text-white",
      icon: <Clock className="w-4 h-4 shrink-0 animate-pulse" />,
      label: `${clubName}`,
      cta: "지금 연락",
      pulse: true,
    },
  };

  const s = styles[level];

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-[90] ${s.pulse ? "animate-pulse" : ""}`}
    >
      <div className="max-w-lg mx-auto px-4 pb-safe">
        <button
          onClick={onClick}
          className={`w-full ${s.bg} ${s.text} rounded-t-2xl px-4 py-3 flex items-center gap-3 shadow-2xl active:opacity-90 transition-opacity`}
        >
          {s.icon}
          <span className="font-bold text-sm truncate flex-1 text-left">
            {s.label}
          </span>
          {extraCount > 0 && (
            <span className="text-xs font-bold opacity-80 shrink-0">
              +{extraCount}건
            </span>
          )}
          <span className="font-black text-base tabular-nums tracking-wider shrink-0">
            {formatTime(remaining)}
          </span>
          <span className="text-xs font-bold opacity-90 shrink-0">
            {s.cta} &rarr;
          </span>
        </button>
      </div>
    </div>
  );
}
