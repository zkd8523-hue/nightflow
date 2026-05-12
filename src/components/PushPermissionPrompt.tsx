"use client";

import { useEffect } from "react";
import { initPushNotifications } from "@/lib/native/pushNotifications";

interface Props {
  userId: string;
}

export function PushPermissionPrompt({ userId }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const STORAGE_KEY = "push_init_done";
    if (localStorage.getItem(STORAGE_KEY)) return;

    const timer = setTimeout(async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      await initPushNotifications(userId);
      localStorage.setItem(STORAGE_KEY, "1");
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  return null;
}
