import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = (next.startsWith("/") && !next.startsWith("//")) ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession 실패:", error.message, error.status);
      return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
    }

    // 카카오 로그인 성공 - users 테이블에 프로필이 있는지 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("id, deleted_at")
        .eq("id", user.id)
        .single();

      // 신규 유저면 회원가입 페이지로 (next 파라미터 유지)
      if (!profile) {
        const signupUrl = new URL("/signup", origin);
        if (safeNext !== "/") {
          signupUrl.searchParams.set("next", safeNext);
        }
        return NextResponse.redirect(signupUrl);
      }

      // 탈퇴한 유저면 복구 페이지로
      if (profile.deleted_at) {
        return NextResponse.redirect(new URL("/recover-account", origin));
      }
    }

    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // 에러 시 로그인 페이지로 리다이렉트
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
