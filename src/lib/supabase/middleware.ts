import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필수 경로 (prefix 매칭)
const PROTECTED_PREFIXES = ["/md/", "/admin/", "/bids", "/my-wins", "/profile", "/favorites", "/settings"];

// 온보딩 리다이렉트에서 제외할 경로 (인증 플로우/API/복구 등)
const ONBOARDING_SKIP_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/auth",
  "/api",
  "/recover-account",
  "/logout",
  "/terms",
  "/privacy",
];

// Migration 108 backfill 기본값: '유저' + id 앞 6자
const BACKFILL_DISPLAY_NAME_PATTERN = /^유저[a-f0-9]{6}$/i;

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

  // 온보딩/접근 제어용 프로필 조회 (로그인 유저 & 비-skip 경로)
  const skipOnboarding = ONBOARDING_SKIP_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const needsProfileFetch = user && (isProtected || !skipOnboarding);

  if (needsProfileFetch) {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, deleted_at, display_name")
      .eq("id", user.id)
      .single();

    // DB 조회 실패 시 (네트워크 오류 등) 차단하지 않고 통과시킴
    // 페이지 레벨에서 중복 권한 체크하므로 여기서는 가용성 우선
    if (profileError) {
      console.error(`[Middleware] users 테이블 조회 실패 - userId: ${user.id}, path: ${pathname}, error:`, profileError.message);
      return supabaseResponse;
    }

    // 탈퇴 유저 차단: /recover-account로 리다이렉트 (보호 경로만 해당)
    if (isProtected && profile?.deleted_at) {
      return NextResponse.redirect(new URL("/recover-account", request.url));
    }

    if (isProtected) {
      if (pathname.startsWith("/admin/") && profile?.role !== "admin") {
        console.warn(`[Middleware] Admin 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
        return NextResponse.redirect(new URL("/", request.url));
      }
      if (pathname.startsWith("/md/") && pathname !== "/md/apply" && profile?.role !== "md" && profile?.role !== "admin") {
        console.warn(`[Middleware] MD 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    // 온보딩 강제: backfill 기본값 display_name 유저는 닉네임 설정 완료 후 진행
    if (
      !skipOnboarding &&
      !profile?.deleted_at &&
      profile?.display_name &&
      BACKFILL_DISPLAY_NAME_PATTERN.test(profile.display_name)
    ) {
      const onboardingUrl = new URL("/onboarding/display-name", request.url);
      onboardingUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return supabaseResponse;
}
