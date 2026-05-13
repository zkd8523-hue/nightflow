"use client";

import { createClient } from "@/lib/supabase/client";

const GOOGLE_WEB_CLIENT_ID =
  "288156738643-seg4hgk4aeuk90bep7o6ml6oi0bi2dpr.apps.googleusercontent.com";

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      mode: "online",
    },
  });
  initialized = true;
}

export async function googleNativeLogin(): Promise<{ isNewUser: boolean }> {
  await ensureInit();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const supabase = createClient();

  const loginResult = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["profile", "email"] },
  });

  if (loginResult.provider !== "google" || loginResult.result.responseType !== "online") {
    throw new Error("구글 로그인 응답 형식이 올바르지 않습니다");
  }

  const idToken = loginResult.result.idToken;
  if (!idToken) throw new Error("구글 로그인 실패: idToken을 받지 못했습니다");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase 세션 생성 실패");

  const { data: profile } = await supabase
    .from("users")
    .select("phone")
    .eq("id", data.user.id)
    .maybeSingle();

  return { isNewUser: !profile?.phone };
}
