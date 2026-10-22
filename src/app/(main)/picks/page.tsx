import type { Metadata } from "next";
import { PicksList } from "@/components/affiliate/PicksList";

// 클럽 필수템 TOP10 — 한 줄 띠·"더보기"가 보내는 키트 페이지.
// 띠가 약속한 "TOP10"을 실제로 보여줘야 기만 광고가 아니다(가이드 2장).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "클럽 필수템 TOP10 - 잘놀러들이 챙기는 것",
  description: "클럽 가기 전 챙기면 좋은 것들 — 숙취, 보조배터리, 입냄새, 향, 헤어까지 한 번에.",
  alternates: { canonical: "https://nightflow.kr/picks" },
  robots: { index: true, follow: false },
};

export default function PicksPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pb-10 pt-5">
      <header className="mb-5">
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#DFFF00]">CLUB ESSENTIALS</p>
        <h1 className="mt-1.5 text-[26px] font-black leading-[1.18] tracking-tight">
          너만 빼고 다 챙긴
          <br />
          클럽 필수템 TOP10
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">숙취 · 충전 · 입냄새 · 향 · 머리 — 나가기 전에 한 번 훑기</p>
      </header>
      <PicksList />
    </main>
  );
}
