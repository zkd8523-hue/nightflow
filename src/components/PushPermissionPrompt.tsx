"use client";

import { useEffect } from "react";
import { initPushNotifications } from "@/lib/native/pushNotifications";
import { Capacitor } from "@capacitor/core";

interface Props {
  userId: string;
}

export function PushPermissionPrompt({ userId }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const STORAGE_KEY = "push_init_done";
    if (localStorage.getItem(STORAGE_KEY)) return;

    // 첫 로그인 후 3초 뒤 권한 요청 (UX: 앱 첫 화면 로드 직후보다 자연스럽게)
    const timer = setTimeout(() => {
      initPushNotifications(userId).then(() => {
        localStorage.setItem(STORAGE_KEY, "1");
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  return null;
}
