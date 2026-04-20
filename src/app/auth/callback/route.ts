import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = (next.startsWith("/") && !next.startsWith("//")) ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // 쿠키를 직접 Response에 첨부하는 패턴 (모바일 호환)
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get("cookie")
            ? request.headers
                .get("cookie")!
                .split("; ")
                .map((c) => {
                  const [name, ...rest] = c.split("=");
                  return { name: name.trim(), value: rest.join("=") };
                })
            : [];
        },
        setAll(items) {
          cookiesToSet.push(...items);
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession 실패:", error.message, error.status);
    const errResponse = NextResponse.redirect(`${origin}/login?error=exchange_failed`);
    cookiesToSet.forEach(({ name, value, options }) => {
      errResponse.cookies.set(name, value, options as Parameters<typeof errResponse.cookies.set>[2]);
    });
    return errResponse;
  }

  // 카카오 로그인 성공 - users 테이블에 프로필이 있는지 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let redirectUrl = `${origin}${safeNext}`;

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("id, deleted_at")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // 신규 유저 → 회원가입 페이지로
      const signupUrl = new URL("/signup", origin);
      if (safeNext !== "/") {
        signupUrl.searchParams.set("next", safeNext);
      }
      redirectUrl = signupUrl.toString();
    } else if (profile.deleted_at) {
      redirectUrl = `${origin}/recover-account`;
    }
  }

  const response = NextResponse.redirect(redirectUrl);
  // 교환된 세션 쿠키를 Response에 직접 첨부 (모바일 핵심 수정)
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
