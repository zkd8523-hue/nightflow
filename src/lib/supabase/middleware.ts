import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필수 경로 (prefix 매칭)
const PROTECTED_PREFIXES = ["/md/", "/admin/", "/bids", "/my-wins", "/profile", "/favorites", "/settings"];

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
  const { data: { user } } = await supabase.auth.getUser();

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

  // 보호된 경로: 탈퇴 유저 차단 + 역할 기반 접근 제어
  if (user && isProtected) {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, deleted_at")
      .eq("id", user.id)
      .single();

    // DB 조회 실패 시 (네트워크 오류 등) 차단하지 않고 통과시킴
    // 페이지 레벨에서 중복 권한 체크하므로 여기서는 가용성 우선
    if (profileError) {
      console.error(`[Middleware] users 테이블 조회 실패 - userId: ${user.id}, path: ${pathname}, error:`, profileError.message);
      return supabaseResponse;
    }

    // 탈퇴 유저 차단: /recover-account로 리다이렉트
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
