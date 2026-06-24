"use client";

import Image from "next/image";
import { X } from "lucide-react";
import {
  useAppDownloadCta,
  getAppCtaCopy,
  PLAY_STORE_URL,
} from "@/hooks/useAppDownloadCta";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useHasActivePuzzle } from "@/hooks/useHasActivePuzzle";

/**
 * 하단 플로팅 앱 다운로드 배너 (안드로이드 웹 전용, 닫기 가능).
 * BottomNav(z-50) 바로 위에 떠서, 콘텐츠를 본 뒤 자연스럽게 다운로드 유도.
 * 대상별 3단 분기: MD / 깃발 꽂은 유저 / 일반.
 */
export function AppDownloadBanner() {
  const { eligible, bannerVisible, dismiss } = useAppDownloadCta();
  const { user } = useCurrentUser();
  const isMd = user?.role === "md" || user?.role === "admin";
  // 배너가 노출되는 안드로이드 웹 + 비MD 유저일 때만 깃발 보유 조회
  const hasActiveFlag = useHasActivePuzzle(
    eligible && !isMd ? user?.id : undefined
  );
  const { title, subtitle } = getAppCtaCopy({ isMd, hasActiveFlag });
  if (!bannerVisible) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 pointer-events-none"
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2.5 border-t border-neutral-700 bg-neutral-800 px-3 py-2.5 shadow-[0_-2px_12px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="앱 다운로드 배너 닫기"
          className="-ml-0.5 shrink-0 p-1 text-neutral-400 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <Image
          src="/app-icon.png"
          alt="나플"
          width={52}
          height={52}
          className="shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-tight text-neutral-400">{subtitle}</p>
        </div>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-green-600 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95"
        >
          앱 사용하기
        </a>
      </div>
    </div>
  );
}
