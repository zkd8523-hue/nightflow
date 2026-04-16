"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { User } from "@/types/database";

declare global {
  interface Window {
    IMP?: {
      init: (userCode: string) => void;
      certification: (
        params: { merchant_uid: string; popup?: boolean; m_redirect_url?: string },
        callback: (response: {
          success: boolean;
          imp_uid?: string;
          merchant_uid?: string;
          error_msg?: string;
        }) => void
      ) => void;
    };
  }
}

export interface RequireIdentityOptions {
  /** 유저에게 보일 안내 문구. 필요 시 커스터마이즈. */
  reason?: string;
}

/**
 * 행동(입찰/연락/퍼즐참여) 직전에 호출하는 공통 인증 훅.
 *
 *   const { isVerified, requireIdentity } = useIdentityGuard(user);
 *   const ok = await requireIdentity({ reason: "경매 입찰 전 본인인증이 필요합니다" });
 *   if (!ok) return;
 *   await placeBid();
 *
 * - 인증돼 있으면 즉시 true 반환 (팝업 없이 통과)
 * - 미인증이면 PortOne 팝업 호출 → 서버 검증 → 성공 시 true
 * - 실패/취소/중복 등은 false 반환 (토스트는 훅에서 처리)
 */
export function useIdentityGuard(user: User | null) {
  const [inFlight, setInFlight] = useState(false);
  // PortOne 미설정 환경에서는 게이트 전체를 건너뛴다 (로컬 테스트용).
  const portoneEnabled = !!process.env.NEXT_PUBLIC_PORTONE_MERCHANT_UID;
  const isVerified = portoneEnabled ? !!user?.identity_verified_at : true;

  const requireIdentity = useCallback(
    async (opts: RequireIdentityOptions = {}): Promise<boolean> => {
      if (!portoneEnabled) return true; // PortOne 미설정 → 우회
      if (isVerified) return true;
      if (!user) {
        toast.error("로그인이 필요합니다.");
        return false;
      }
      if (inFlight) return false;

      if (typeof window === "undefined" || !window.IMP) {
        toast.error("본인인증 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }

      const userCode = process.env.NEXT_PUBLIC_PORTONE_MERCHANT_UID;
      if (!userCode) {
        toast.error("본인인증 설정이 완료되지 않았습니다. 운영팀에 문의해주세요.");
        return false;
      }

      if (opts.reason) toast.info(opts.reason);

      setInFlight(true);
      try {
        window.IMP.init(userCode);
        const merchant_uid = `nightflow_cert_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        const impUid = await new Promise<string | null>((resolve) => {
          window.IMP!.certification(
            { merchant_uid, popup: true },
            (response) => {
              if (!response.success || !response.imp_uid) {
                resolve(null);
                return;
              }
              resolve(response.imp_uid);
            }
          );
        });

        if (!impUid) {
          toast.error("본인인증이 완료되지 않았습니다.");
          return false;
        }

        const res = await fetch("/api/auth/portone/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imp_uid: impUid }),
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
              toast.error("본인인증 서버 호출 실패. 잠시 후 다시 시도해주세요.");
              break;
            default:
              toast.error("본인인증에 실패했습니다.");
          }
          return false;
        }

        toast.success("본인인증이 완료되었습니다.");
        return true;
      } finally {
        setInFlight(false);
      }
    },
    [inFlight, isVerified, portoneEnabled, user]
  );

  return { isVerified, requireIdentity, inFlight };
}
