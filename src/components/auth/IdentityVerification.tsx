"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";

interface Props {
  onSuccess: () => void | Promise<void>;
  onFail?: (reason: string) => void;
  label?: string;
  fullWidth?: boolean;
}

/**
 * 다날 휴대폰 본인인증 팝업을 여는 버튼.
 *
 * 1. /api/auth/danal/init → authUrl 수신
 * 2. window.open(authUrl) 으로 다날 팝업 열기
 * 3. 인증 완료 → /api/auth/danal/callback이 팝업에서 postMessage("DANAL_SUCCESS")
 * 4. 부모 윈도우가 메시지 수신 → onSuccess 콜백
 */
export function IdentityVerification({ onSuccess, onFail, label, fullWidth = true }: Props) {
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/danal/init", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || "본인인증 시작 실패";
        toast.error(msg);
        onFail?.(msg);
        return;
      }

      const popup = window.open(
        data.authUrl,
        "danal_auth",
        "width=430,height=640,scrollbars=yes"
      );

      if (!popup) {
        toast.error("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.");
        onFail?.("POPUP_BLOCKED");
        return;
      }

      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }

      const handler = async (e: MessageEvent) => {
        if (e.data?.type === "DANAL_SUCCESS") {
          window.removeEventListener("message", handler);
          listenerRef.current = null;
          toast.success("본인인증이 완료되었습니다.");
          await onSuccess();
        } else if (e.data?.type === "DANAL_FAIL") {
          window.removeEventListener("message", handler);
          listenerRef.current = null;
          const reason = e.data?.message || "인증 실패";
          toast.error(reason);
          onFail?.(reason);
        }
      };

      listenerRef.current = handler;
      window.addEventListener("message", handler);
    } catch (err) {
      logger.error("[IdentityVerification] error:", err);
      toast.error("본인인증 시작에 실패했습니다.");
      onFail?.("NETWORK_ERROR");
    }
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
