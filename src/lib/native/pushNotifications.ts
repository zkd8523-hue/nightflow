"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

export async function initPushNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async ({ value: token }) => {
    const platform = Capacitor.getPlatform() as "android" | "ios";
    const supabase = createClient();
    await supabase.from("push_tokens").upsert(
      { user_id: userId, token, platform },
      { onConflict: "user_id,platform" }
    );
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[Push] registration error:", err);
  });

  // 포그라운드 알림 수신 (앱이 열려있을 때)
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[Push] foreground:", notification.title);
  });

  // 알림 탭해서 앱 진입
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification.data?.url as string | undefined;
    if (url) window.location.href = url;
  });
}

export async function removePushToken(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const supabase = createClient();
  const platform = Capacitor.getPlatform() as "android" | "ios";
  await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);
}
