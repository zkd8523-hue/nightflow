"use client";

import Link from "next/link";
import { ChevronRight, ArrowUp } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * MD/admin에게만 노출되는 조각(MD 직통) 행동 유도 띠.
 *
 * "판매"가 아니라 "관리" 프레임 — MD는 이미 다른 채널로 자리를 잘 팔고 있으니,
 * NightFlow는 그걸 더 편하게 관리하는 도구로 포지셔닝.
 * 게스트 광고판(amber)과 구분되게 green 톤. 클릭 시 바로 조각 등록으로.
 */
export function ShareManageMdCta() {
  const { user, isLoading } = useCurrentUser();
  const isMdOrAdmin = user?.role === "md" || user?.role === "admin";

  if (isLoading) return null;
  if (!isMdOrAdmin) return null;

  return (
    <Link
      href="/md/auctions/new"
      className="w-full flex items-center gap-2 rounded-2xl px-4 py-3 bg-amber-500/15 border border-amber-500/40 active:scale-[0.99] transition-transform text-left"
    >
      <ArrowUp className="w-4 h-4 text-brand-amber shrink-0 animate-bounce" />
      <p className="text-[12.5px] font-bold leading-snug flex-1 text-foreground dark:text-amber-50">
        <span className="text-brand-amber">조각</span>, 나플에서 편하게 관리하세요.
      </p>
      <ChevronRight className="w-4 h-4 shrink-0 text-brand-amber" />
    </Link>
  );
}
