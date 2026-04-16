"use client";

import { Card } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { IdentityVerification } from "./IdentityVerification";
import type { User } from "@/types/database";

interface Props {
  currentUser: User | null;
  reason?: string;
  children: React.ReactNode;
}

/**
 * 자식 컴포넌트를 감싸 본인인증 여부에 따라 노출을 제어.
 * 인증 완료된 유저에겐 children 그대로, 미인증 유저에겐 대체 카드 + 인증 버튼 노출.
 */
export function IdentityVerificationGate({ currentUser, reason, children }: Props) {
  if (currentUser?.identity_verified_at) {
    return <>{children}</>;
  }

  return (
    <Card className="bg-amber-500/10 border-amber-500/30 p-6 text-center space-y-3">
      <div className="flex flex-col items-center gap-2">
        <ShieldCheck className="w-8 h-8 text-amber-500" />
        <h3 className="font-bold text-white">본인인증이 필요합니다</h3>
        <p className="text-sm text-neutral-400">
          {reason ?? "안전한 거래를 위해 휴대폰 본인인증이 필요합니다."}
        </p>
      </div>
      <IdentityVerification
        onSuccess={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
      />
    </Card>
  );
}
