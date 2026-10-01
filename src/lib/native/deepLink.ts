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
            pointer-events:none; white-space:nowrap;
          `;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        }
      });
    });
  });
}

/**
 * https://nightflow.kr/... 링크(Universal Links / App Links)로 앱이 열렸을 때 웹뷰를 그 경로로 보낸다.
 * 앱 안에서 /app(다운로드 스마트 링크)은 다시 스토어로 튕기므로 홈으로 바꾼다.
 * 처리했으면 true.
 */
function openWebLink(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || (u.hostname !== "nightflow.kr" && u.hostname !== "www.nightflow.kr")) return false;
  const target = u.pathname === "/app" ? "/" : `${u.pathname}${u.search}${u.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target !== current) window.location.href = target;
  return true;
}

export function initDeepLinkHandler() {
  if (typeof window === "undefined") return;

  import("@capacitor/core").then(({ Capacitor }) => {
    if (!Capacitor.isNativePlatform()) return;

    import("@capacitor/app").then(({ App }) => {
      // 콜드 스타트로 링크가 앱을 띄운 경우 — 웹뷰가 홈(server.url)을 먼저 로드한 뒤에야
      // 이 리스너가 붙어서 appUrlOpen을 놓칠 수 있다. 실행 URL을 한 번 확인한다.
      App.getLaunchUrl()
        .then((launch) => {
          if (!launch?.url) return;
          const key = `naflLaunchUrlHandled:${launch.url}`;
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
          openWebLink(launch.url);
        })
        .catch(() => {});

      App.addListener("appUrlOpen", async ({ url }) => {
        if (openWebLink(url)) return;
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
