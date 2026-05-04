import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필수 경로 (prefix 매칭)
const PROTECTED_PREFIXES = ["/md/", "/admin/", "/bids", "/my-wins", "/profile", "/favorites", "/settings", "/my-penalties"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (IMPORTANT: getUser()로 서버 검증)
  const { data: { user: rawUser }, error: getUserError } = await supabase.auth.getUser();

  // scope: 'local' → 네트워크 호출 없이 setAll 콜백만 실행되어 만료 쿠키 정리.
  // 기본값('global')은 Supabase /logout POST가 hang하면 미들웨어 전체가 멈춤.
  // 만료 토큰은 서버에 통보할 의미가 없으므로 로컬 정리만으로 충분.
  // /auth/* (OAuth 콜백)는 PKCE code_verifier 보존 필요하므로 제외.
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/");
  if (getUserError && !isAuthCallback) {
    await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]).catch(() => {});
  }

  // 세션 검증 실패 시 같은 요청 안에서 user를 null로 취급해야 후속 redirect 로직이 정합성 유지
  const user = getUserError && !isAuthCallback ? null : rawUser;

  // ?ref= 파라미터 → 쿠키 저장 (30일, 바이럴 추적용)
  const refCode = request.nextUrl.searchParams.get('ref');
  if (refCode) {
    supabaseResponse.cookies.set('referral_code', refCode, {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // 보호된 경로 접근 시 로그인 확인
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }


  // 보호 경로에만 프로필 권한 체크 수행
  if (user && isProtected) {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, deleted_at")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error(`[Middleware] users 테이블 조회 실패 - userId: ${user.id}, path: ${pathname}, error:`, profileError.message);
      return supabaseResponse;
    }

    if (profile?.deleted_at) {
      return NextResponse.redirect(new URL("/recover-account", request.url));
    }

    if (pathname.startsWith("/admin/") && profile?.role !== "admin") {
      console.warn(`[Middleware] Admin 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (pathname.startsWith("/md/") && pathname !== "/md/apply" && profile?.role !== "md" && profile?.role !== "admin") {
      console.warn(`[Middleware] MD 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}
