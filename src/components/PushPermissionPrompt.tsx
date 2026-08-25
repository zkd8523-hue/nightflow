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
    // DB에 남아 푸시가 전달되지 않는다.
    //
    // requestIfNeeded=false — 권한을 아직 안 물어본(prompt) 유저에게 설명 없이
    // OS 팝업을 띄우지 않는다. 그 역할은 LoginNotifyPromptSheet가 대신한다.
    // 여기서는 "이미 허용된" 유저의 토큰만 조용히 갱신한다.
    const timer = setTimeout(async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      await initPushNotifications(userId, false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  return null;
}
