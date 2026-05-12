"use client";

import { createClient } from "@/lib/supabase/client";

export async function kakaoNativeLogin(): Promise<{ isNewUser: boolean }> {
  const { KakaoLoginPlugin } = await import("capacitor-kakao-login-plugin");
  const supabase = createClient();

  // 카카오 SDK 로그인 (주소창 없음)
  const kakaoResult = await KakaoLoginPlugin.goLogin();
  const accessToken = kakaoResult.accessToken;
  if (!accessToken) throw new Error("카카오 로그인 실패");

  // Edge Function으로 Supabase 세션 발급
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${supabaseUrl}/functions/v1/kakao-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "서버 인증 실패");
  }

  const { access_token, refresh_token, is_new_user } = await res.json();

  // Supabase 세션 설정
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;

  return { isNewUser: is_new_user };
}
