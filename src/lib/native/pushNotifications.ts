"use client";

import { createClient } from "@/lib/supabase/client";

export type PushInitResult = "granted" | "denied" | "not_native";

/**
 * @param requestIfNeeded false면 이미 granted인 경우에만 토큰을 재등록하고,
 *   prompt/denied 상태에서는 OS 팝업을 띄우지 않고 조용히 끝낸다
 *   (LoginNotifyPromptSheet가 사용자 동의를 받은 뒤에만 true로 호출한다).
 */
export async function initPushNotifications(
  userId: string,
  requestIfNeeded: boolean = true
): Promise<PushInitResult> {
  if (typeof window === "undefined") return "not_native";

  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return "not_native";

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const current = await PushNotifications.checkPermissions();
  let permission = current;
  if (current.receive !== "granted") {
    if (!requestIfNeeded) return "denied";
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") return "denied";

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

  return "granted";
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
