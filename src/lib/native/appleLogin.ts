"use client";

import { createClient } from "@/lib/supabase/client";

const APPLE_CLIENT_ID = "kr.nightflow.app";

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    apple: { clientId: APPLE_CLIENT_ID },
  });
  initialized = true;
}

export async function appleNativeLogin(): Promise<{ isNewUser: boolean }> {
  await ensureInit();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const supabase = createClient();

  const loginResult = await SocialLogin.login({
    provider: "apple",
    options: { scopes: ["email", "name"] },
  });

  if (loginResult.provider !== "apple") {
    throw new Error("애플 로그인 응답 형식이 올바르지 않습니다");
  }

  const idToken = loginResult.result.idToken;
  if (!idToken) throw new Error("애플 로그인 실패: idToken을 받지 못했습니다");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
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
