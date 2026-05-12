"use client";

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { createClient } from "@/lib/supabase/client";

export function initDeepLinkHandler() {
  if (!Capacitor.isNativePlatform()) return;

  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith("nightflow://auth/callback")) return;

    const supabase = createClient();

    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get("code");

      // hash fragment에서 토큰 추출 (implicit flow fallback)
      const hash = url.includes("#") ? url.split("#")[1] : "";
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        // PKCE flow: 클라이언트에서 code 교환 (code_verifier가 webview localStorage에 있음)
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          const next = urlObj.searchParams.get("next") || "/";
          window.location.href = next.startsWith("/") ? next : "/";
        }
      } else if (accessToken && refreshToken) {
        // Implicit flow fallback
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error) window.location.href = "/";
      }
    } catch (e) {
      console.error("[DeepLink] auth callback error:", e);
    }
  });
}
