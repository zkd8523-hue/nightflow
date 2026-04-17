"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { User } from "@/types/database";

export interface RequireIdentityOptions {
  reason?: string;
}

/**
 * 행동(입찰/연락/퍼즐참여) 직전에 호출하는 공통 인증 훅.
 *
 * - 인증돼 있으면 즉시 true 반환
 * - 미인증이면 다날 팝업(/api/auth/danal/init → window.open → postMessage) → 성공 시 true
 * - 다날 환경변수 미설정이면 게이트 자동 우회 (로컬 테스트용)
 */
export function useIdentityGuard(user: User | null) {
  const [inFlight, setInFlight] = useState(false);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const danalEnabled = !!process.env.NEXT_PUBLIC_DANAL_CPID;
  const isVerified = danalEnabled ? !!user?.identity_verified_at : true;

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("message", listenerRef.current);
      }
    };
  }, []);

  const requireIdentity = useCallback(
    async (opts: RequireIdentityOptions = {}): Promise<boolean> => {
      if (!danalEnabled) return true;
      if (isVerified) return true;
      if (!user) {
        toast.error("로그인이 필요합니다.");
        return false;
      }
      if (inFlight) return false;

      if (opts.reason) toast.info(opts.reason);

      setInFlight(true);
      try {
        const initRes = await fetch("/api/auth/danal/init", { method: "POST" });
        const initData = await initRes.json();

        if (!initRes.ok) {
          toast.error(initData.error || "본인인증 시작 실패");
          return false;
        }

        const popup = window.open(
          initData.authUrl,
          "danal_auth",
          "width=430,height=640,scrollbars=yes"
        );

        if (!popup) {
          toast.error("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.");
          return false;
        }

        return await new Promise<boolean>((resolve) => {
          if (listenerRef.current) {
            window.removeEventListener("message", listenerRef.current);
          }

          const handler = (e: MessageEvent) => {
            if (e.data?.type === "DANAL_SUCCESS") {
              window.removeEventListener("message", handler);
              listenerRef.current = null;
              toast.success("본인인증이 완료되었습니다.");
              resolve(true);
            } else if (e.data?.type === "DANAL_FAIL") {
              window.removeEventListener("message", handler);
              listenerRef.current = null;
              toast.error(e.data?.message || "본인인증에 실패했습니다.");
              resolve(false);
            }
          };

          listenerRef.current = handler;
          window.addEventListener("message", handler);

          const pollClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(pollClosed);
              if (listenerRef.current === handler) {
                window.removeEventListener("message", handler);
                listenerRef.current = null;
                toast.error("본인인증이 완료되지 않았습니다.");
                resolve(false);
              }
            }
          }, 500);
        });
      } finally {
        setInFlight(false);
      }
    },
    [danalEnabled, inFlight, isVerified, user]
  );

  return { isVerified, requireIdentity, inFlight };
}
