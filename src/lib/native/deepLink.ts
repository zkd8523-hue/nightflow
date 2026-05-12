"use client";

import { createClient } from "@/lib/supabase/client";

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
