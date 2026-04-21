import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = (next.startsWith("/") && !next.startsWith("//")) ? next : "/";

  if (!code) {
    console.error("[auth/callback] code 파라미터 없음");
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // setAll 호출될 때 쿠키를 캡처해서 Response에 직접 첨부
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // NextRequest.cookies는 모든 쿠키를 정확히 파싱함
          return request.cookies.getAll();
        },
        setAll(items) {
          cookiesToSet.push(...items);
        },
      },
    }
  );

  // 코드 → 세션 교환 (session 객체에 user 포함)
  const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !exchangeData?.session) {
    console.error("[auth/callback] exchangeCodeForSession 실패:", exchangeError?.message, exchangeError?.status);
    const errCode = exchangeError?.message?.includes("code verifier") ? "pkce_failed" : "exchange_failed";
    const errResponse = NextResponse.redirect(`${origin}/login?error=${errCode}`);
    cookiesToSet.forEach(({ name, value, options }) => {
      errResponse.cookies.set(name, value, options as Parameters<typeof errResponse.cookies.set>[2]);
    });
    return errResponse;
  }

  // exchangeCodeForSession이 반환한 user 직접 사용 (추가 getUser 호출 없음)
  const user = exchangeData.session.user;

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
      if (safeNext !== "/") signupUrl.searchParams.set("next", safeNext);
      redirectUrl = signupUrl.toString();
    } else if (profile.deleted_at) {
      redirectUrl = `${origin}/recover-account`;
    }
  }

  // 진단용: 콜백이 설정한 쿠키 개수를 URL에 기록 (_s=쿠키수)
  const separator = redirectUrl.includes("?") ? "&" : "?";
  const urlWithDiag = `${redirectUrl}${separator}_s=${cookiesToSet.length}`;

  const response = NextResponse.redirect(urlWithDiag);
  // 교환된 세션 쿠키를 Response에 직접 첨부 (모바일 핵심)
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
