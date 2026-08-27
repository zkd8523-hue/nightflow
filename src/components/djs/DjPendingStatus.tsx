"use client";

import { Clock, Instagram, Home } from "lucide-react";
import { useRouter } from "next/navigation";

export function DjPendingStatus({
  instagram,
  djName,
}: {
  instagram: string;
  djName: string | null | undefined;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          <Clock className="w-8 h-8 text-brand-amber" />
        </div>
        <h1 className="text-xl font-black text-foreground">승인 대기 중</h1>
        <p className="text-muted-foreground text-[13px]">
          관리자가 확인 후 인증해드립니다. 잠시만 기다려주세요.
        </p>
      </div>

      {djName && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-[13px] text-muted-foreground mb-1">신청한 활동명</p>
          <p className="text-foreground font-bold text-lg">{djName}</p>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <Instagram className="w-4 h-4 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">등록된 인스타그램</p>
        </div>
        <p className="text-foreground font-bold text-lg">@{instagram}</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-brand-amber" />
          <p className="text-brand-amber font-bold text-[13px]">승인 대기 중</p>
        </div>
        <p className="text-muted-foreground text-[12px]">
          보통 24시간 이내에 승인이 완료됩니다.
          승인되면 알림으로 안내해드립니다.
        </p>
      </div>

      <button
        onClick={() => router.push("/")}
        className="w-full py-3 flex items-center justify-center gap-2 text-muted-foreground text-[13px] font-medium hover:text-foreground transition-colors"
      >
        <Home className="w-4 h-4" />
        홈으로 돌아가기
      </button>
    </div>
  );
}
