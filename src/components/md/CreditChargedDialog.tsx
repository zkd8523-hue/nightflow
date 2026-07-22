"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

interface CreditChargedDetail {
  title: string;
  message: string;
  actionUrl?: string | null;
}

/**
 * 크레딧 적립 완료 축하 팝업(다이얼로그).
 * useNotifications 가 새 'credit_charged' 인앱 알림을 감지하면
 * window CustomEvent("nightflow:credit-charged") 를 발생시키고, 이 컴포넌트가 받아 표시한다.
 * Header 에 전역 마운트되어 앱 어디서든 뜬다.
 */
export function CreditChargedDialog() {
  const [detail, setDetail] = useState<CreditChargedDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as CreditChargedDetail | undefined;
      setDetail({
        title: d?.title || "크레딧 적립 완료",
        message: d?.message || "크레딧이 충전되었습니다.",
        actionUrl: d?.actionUrl ?? null,
      });
    };
    window.addEventListener("nightflow:credit-charged", handler);
    return () => window.removeEventListener("nightflow:credit-charged", handler);
  }, []);

  if (!detail) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={() => setDetail(null)}
    >
      <div
        className="w-full max-w-xs rounded-3xl bg-card border border-border p-6 text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
          <CircleCheck className="w-8 h-8 text-green-500" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-black text-foreground">{detail.title}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{detail.message}</p>
        </div>
        <button
          onClick={() => setDetail(null)}
          className="w-full rounded-full bg-inverse text-inverse-foreground font-black py-3.5"
        >
          확인
        </button>
      </div>
    </div>
  );
}
