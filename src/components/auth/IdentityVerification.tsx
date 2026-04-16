"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";

/**
 * PortOne PASS 본인인증 팝업을 여는 버튼.
 *
 * 사용법:
 *  <IdentityVerification onSuccess={() => ...} />
 *
 * PortOne 브라우저 SDK (`IMP.certification`)를 호출하고, 성공 시
 * `/api/auth/portone/verify`로 imp_uid를 전달해 서버 검증을 수행한다.
 *
 * PortOne SDK 스크립트는 루트 레이아웃에서 <Script src="https://cdn.iamport.kr/v1/iamport.js" /> 로 로드된다고 가정.
 */

// window.IMP 타입은 @/hooks/useIdentityGuard 에서 선언

interface Props {
  onSuccess: () => void | Promise<void>;
  onFail?: (reason: string) => void;
  label?: string;
  fullWidth?: boolean;
}

export function IdentityVerification({ onSuccess, onFail, label, fullWidth = true }: Props) {
  const handleClick = useCallback(() => {
    const userCode = process.env.NEXT_PUBLIC_PORTONE_MERCHANT_UID;
    if (!userCode || typeof window === "undefined" || !window.IMP) {
      toast.error("본인인증 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      onFail?.("SDK_NOT_READY");
      return;
    }

    window.IMP.init(userCode);
    const merchant_uid = `nightflow_cert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    window.IMP.certification(
      { merchant_uid, popup: true },
      async (response) => {
        if (!response.success || !response.imp_uid) {
          const reason = response.error_msg ?? "CANCELLED";
          logger.log("[IdentityVerification] 팝업 취소/실패:", reason);
          onFail?.(reason);
          return;
        }

        try {
          const res = await fetch("/api/auth/portone/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imp_uid: response.imp_uid }),
          });
          const data = await res.json();

          if (!res.ok) {
            switch (data.error) {
              case "UNDER_AGE":
                toast.error("만 19세 이상만 이용할 수 있습니다.");
                break;
              case "CI_CONFLICT":
                toast.error("이미 다른 카카오 계정으로 가입된 본인인증입니다.");
                break;
              case "UNAUTHORIZED":
                toast.error("로그인이 필요합니다.");
                break;
              case "PORTONE_ERROR":
                toast.error("본인인증 조회 실패. 잠시 후 다시 시도해주세요.");
                break;
              default:
                toast.error("본인인증에 실패했습니다.");
            }
            onFail?.(data.error ?? "UNKNOWN");
            return;
          }

          toast.success("본인인증이 완료되었습니다.");
          await onSuccess();
        } catch (err) {
          logger.error("[IdentityVerification] verify 호출 실패:", err);
          toast.error("본인인증 서버 호출 실패.");
          onFail?.("NETWORK_ERROR");
        }
      }
    );
  }, [onSuccess, onFail]);

  return (
    <Button
      type="button"
      onClick={handleClick}
      className={fullWidth ? "w-full" : ""}
      variant="default"
    >
      <ShieldCheck className="w-4 h-4 mr-2" />
      {label ?? "본인인증 시작"}
    </Button>
  );
}
