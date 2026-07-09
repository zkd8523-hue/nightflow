"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  fallbackHref?: string;
}

export function BackButton({ fallbackHref = "/" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    // history.length는 새 탭에서도 최소 2 (about:blank + 현재). 외부(구글 검색결과 등)에서
    // 바로 진입한 경우 router.back()이 우리 사이트 밖으로 튕겨나가는 문제 발생 → referrer로 판정.
    if (typeof window !== "undefined") {
      const ref = document.referrer;
      const sameOrigin = ref && ref.startsWith(window.location.origin);
      if (sameOrigin && window.history.length > 1) {
        router.back();
        return;
      }
    }
    router.push(fallbackHref);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className="rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );
}
