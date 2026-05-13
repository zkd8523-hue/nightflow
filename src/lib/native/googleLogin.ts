"use client";

import { createClient } from "@/lib/supabase/client";

const GOOGLE_WEB_CLIENT_ID =
  "288156738643-seg4hgk4aeuk90bep7o6ml6oi0bi2dpr.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const { Capacitor } = await import("@capacitor/core");
  const isIOS = Capacitor.getPlatform() === "ios";

  if (isIOS && !GOOGLE_IOS_CLIENT_ID) {
    throw new Error(
      "iOS Google 로그인이 설정되지 않았습니다. NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID를 .env.local에 추가하세요.",
    );
  }

  await SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      ...(isIOS && GOOGLE_IOS_CLIENT_ID
        ? {
            iOSClientId: GOOGLE_IOS_CLIENT_ID,
            iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
          }
        : {}),
      mode: "online",
    },
  });
  initialized = true;
}

export async function googleNativeLogin(): Promise<{ isNewUser: boolean }> {
  await ensureInit();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const supabase = createClient();

  // scopes 미지정: capgo가 MainActivity 수정을 요구하므로 생략
  // (email/profile은 Google Credential Manager의 idToken에 기본 포함됨)
  const loginResult = await SocialLogin.login({
    provider: "google",
    options: {},
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
