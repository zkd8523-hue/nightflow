"use client";

import { createClient } from "@/lib/supabase/client";

const GOOGLE_WEB_CLIENT_ID =
  "288156738643-seg4hgk4aeuk90bep7o6ml6oi0bi2dpr.apps.googleusercontent.com";
// NEXT_PUBLIC_* 변수는 어차피 클라이언트 번들에 포함되므로 보안 차이 없음.
// Vercel 환경변수 박힘 문제 우회 위해 fallback 하드코딩 (환경변수 있으면 그쪽 우선).
const GOOGLE_IOS_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  "288156738643-kr4jg0rgtce96hgij027vqguolao05u8.apps.googleusercontent.com";

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const { Capacitor } = await import("@capacitor/core");
  const isIOS = Capacitor.getPlatform() === "ios";

  await SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      ...(isIOS
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
