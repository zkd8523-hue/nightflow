"use client";

import { createClient } from "@/lib/supabase/client";
import { navigateGlobally } from "@/lib/native/globalRouter";

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

  // 리스너는 register() "전에" 붙이고, 붙이기 전에 이전 것을 전부 뗀다(2026-09-30).
  // 예전엔 register() 뒤에 붙였다 — 같은 앱 세션에서 두 번째 호출(계정 전환 직후)이면
  // 토큰이 이미 캐시돼 있어 registration 이벤트가 새 리스너보다 먼저 와서 버려졌고,
  // 첫 호출 때 붙은 리스너는 이전 계정 id를 쥔 채 남아 이전 계정 행만 갱신했다.
  // 그래서 한 폰에서 계정을 바꾸면 새 계정엔 토큰이 안 생겨 푸시가 안 왔다
  // (admin → 테스트 MD 123@123.123 전환에서 발견).
  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", async ({ value: token }) => {
    const platform = Capacitor.getPlatform() as "android" | "ios";
    const supabase = createClient();
    const { error } = await supabase.from("push_tokens").upsert(
      { user_id: userId, token, platform },
      { onConflict: "user_id,platform" }
    );
    if (error) console.error("[Push] token save failed:", error);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("[Push] registration error:", err);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[Push] foreground:", notification.title);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification.data?.url as string | undefined;
    if (!url) return;
    // 클라이언트 라우팅(router.push)이 되면 전체 새로고침 없이 즉시 전환된다.
    // window.location.href는 앱을 처음부터 다시 부팅해 홈이 잠깐 스쳐간 뒤 목적지가
    // 뜨는 지연을 만든다(2026-09-30) — router가 아직 등록 전일 때만 그걸로 폴백한다.
    if (!navigateGlobally(url)) window.location.href = url;
  });

  await PushNotifications.register();

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
