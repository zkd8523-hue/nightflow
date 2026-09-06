"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// 브라우저 히스토리로 진짜 "이전 화면"을 돌아간다.
//
// 예전엔 이게 <Link href={foreignHome}>이라 항상 외국인 홈으로 고정 이동했다.
// 폼 3장(연락처)까지 채운 손님이 눌러도 무조건 홈으로 튕겨나가 사실상 "취소"
// 버튼처럼 동작했다 — 클럽 상세에서 "Book at ○○"를 누르고 들어온 손님이라면
// 그 클럽 상세로, 폼 안에서 온 거라면 이전 상태로 돌아가야 자연스럽다.
//
// 히스토리가 없는 경우(북마크·직접 URL 진입 등)를 대비해 fallbackHref로 돌아간다.
export function BackButton({ label, fallbackHref }: { label: string; fallbackHref: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        // history.length는 탭 안에서 쌓인 엔트리 수 — 1이면 이 탭의 첫 페이지라
        // 뒤로 갈 곳이 없다(직접 링크로 들어온 경우).
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="inline-flex items-center gap-1 -ml-1 mb-4 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <ChevronLeft className="w-5 h-5" />
      <span className="text-[14px] font-bold">{label}</span>
    </button>
  );
}
