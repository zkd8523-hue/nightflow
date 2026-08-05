import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata: Metadata = { title: "시작하기" };

// 깃발 / 조각 선택 페이지 — 헤더 "시작하기"에서 진입, 양쪽 카드로 제시
export default function StartPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link
          href="/"
          aria-label="뒤로"
          className="inline-flex items-center gap-1 -ml-1 mb-6 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-[14px] font-bold">뒤로</span>
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground tracking-tight break-keep">원하는 방식으로 클럽을 예약해보세요</h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 깃발 */}
          <Link
            href="/flags/new"
            className="flex flex-col rounded-3xl border border-amber-500/50 bg-amber-500/[0.06] p-5 active:scale-[0.98] transition-transform"
          >
            <span className="text-[34px] leading-none">🚩</span>
            <p className="text-[18px] font-black text-foreground mt-3">깃발</p>
            <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed break-keep flex-1">
              예산 50만원부터 · 인원 확정.<br />클럽에서 시크릿오퍼를 보내요.
            </p>
            <span className="mt-4 inline-flex items-center justify-center h-10 rounded-xl bg-amber-500 text-black text-[13px] font-black">
              깃발 꽂기
            </span>
          </Link>

          {/* 파티 */}
          <Link
            href="/shares/new"
            className="flex flex-col rounded-3xl border border-green-500/30 bg-green-500/[0.06] p-5 active:scale-[0.98] transition-transform"
          >
            <span className="text-[34px] leading-none">🎉</span>
            <p className="text-[18px] font-black text-foreground mt-3">파티</p>
            <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed break-keep flex-1">
              인당 7만원부터 · 파티원 모아서 예약하기<br />깃발과 똑같은 오퍼를 받아요.
            </p>
            <span className="mt-4 inline-flex items-center justify-center h-10 rounded-xl bg-green-500 text-black text-[13px] font-black">
              파티 모으기
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
