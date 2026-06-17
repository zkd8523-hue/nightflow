"use client";

import { useEffect } from "react";
import { initPushNotifications } from "@/lib/native/pushNotifications";

interface Props {
  userId: string;
}

export function PushPermissionPrompt({ userId }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 매 세션마다 토큰을 재등록(upsert)한다. FCM 토큰은 앱 재설치·데이터 삭제·
    // 주기적 갱신으로 무효화(UNREGISTERED)되므로, 한 번만 등록하면 죽은 토큰이
    // DB에 남아 푸시가 전달되지 않는다. 권한 팝업은 OS가 1회만 노출하므로
    // 매번 호출해도 사용자에게 반복 노출되지 않는다.
    const timer = setTimeout(async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      await initPushNotifications(userId);
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  return null;
}
