"use client";

import { createClient } from "@/lib/supabase/client";

export function initBackButtonHandler() {
  if (typeof window === "undefined") return;

  import("@capacitor/core").then(({ Capacitor }) => {
    if (!Capacitor.isNativePlatform()) return;

    import("@capacitor/app").then(({ App }) => {
      let lastBackPress = 0;

      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        // 홈(루트)에서 더블탭 종료
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          App.exitApp();
        } else {
          lastBackPress = now;
          // 토스트 메시지 (웹뷰 alert 대신 간단히)
          const toast = document.createElement("div");
          toast.textContent = "한 번 더 누르면 종료됩니다";
          toast.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.75); color:#fff; padding:10px 20px;
            border-radius:20px; font-size:14px; z-index:9999;
            pointer-events:none;
          `;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        }
      });
    });
  });
}

export function initDeepLinkHandler() {
  if (typeof window === "undefined") return;

  import("@capacitor/core").then(({ Capacitor }) => {
    if (!Capacitor.isNativePlatform()) return;

    import("@capacitor/app").then(({ App }) => {
      App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("nightflow://auth/callback")) return;

        const supabase = createClient();
        try {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get("code");

          const hash = url.includes("#") ? url.split("#")[1] : "";
          const hashParams = new URLSearchParams(hash);
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
              const next = urlObj.searchParams.get("next") || "/";
              window.location.href = next.startsWith("/") ? next : "/";
            }
          } else if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error) window.location.href = "/";
          }
        } catch (e) {
          console.error("[DeepLink] auth callback error:", e);
        }
      });
    });
  });
}
