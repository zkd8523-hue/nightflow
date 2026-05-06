"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics/events";

export function LoginSuccessTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const authSuccess = searchParams.get("auth_success");
    if (!authSuccess) return;

    // 기존 유저 로그인만 추적 (신규 가입은 SignupForm의 signup_completed 이벤트로 추적)
    if (authSuccess.startsWith("login")) {
      const method = authSuccess.split("_")[1] || "kakao";
      trackEvent("login", { method });
    }

    // URL에서 auth_success 파라미터 제거
    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth_success");
    const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
