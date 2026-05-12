"use client";

import { createClient } from "@/lib/supabase/client";

export async function initPushNotifications(userId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

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

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[Push] foreground:", notification.title);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification.data?.url as string | undefined;
    if (url) window.location.href = url;
  });
}

export async function removePushToken(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const platform = Capacitor.getPlatform() as "android" | "ios";
  const supabase = createClient();
  await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);
}
