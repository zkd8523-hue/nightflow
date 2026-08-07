import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필수 경로 (prefix 매칭)
const PROTECTED_PREFIXES = ["/md/apply", "/admin", "/bids", "/my-wins", "/profile", "/favorites", "/settings", "/my-penalties"];

// /md/ 아래에는 MD 대시보드((dashboard)/md/*)와 공개 MD 프로필((main)/md/[slug])이 섞여 있다.
// "/md/" 전체를 보호하면 MD가 인스타 바이오에 걸어둔 공개 프로필까지 로그인 벽에 걸리고,
// sitemap에 올라간 /md/<slug> URL들이 크롤러에게 로그인 리다이렉트를 반환해 색인이 안 된다.
// 그래서 대시보드 경로만 명시적으로 보호하고, 나머지(=슬러그)는 공개로 둔다.
// ⚠️ (dashboard)/md 아래에 새 라우트를 추가하면 이 배열에도 반드시 추가할 것.
const MD_DASHBOARD_PREFIXES = [
  "/md/auctions",
  "/md/clubs",
  "/md/credits",
  "/md/dashboard",
  "/md/floor-plan",
  "/md/hotdeal",
  "/md/hotdeal-now",
  "/md/settings",
  "/md/share-slots",
  "/md/transactions",
  "/md/vip",
];

// "/md/hotdeal"이 "/md/hotdeal-now"를 삼키지 않도록 정확 일치 또는 하위 경로만 매칭
const isMdDashboardPath = (pathname: string) =>
  MD_DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

export async function updateSession(request: NextRequest) {
  // request.headers는 부모 미들웨어에서 x-pathname을 이미 세팅함.
  // NextResponse.next({ request: { headers } })로 명시적으로 downstream(서버 컴포넌트)에 전달.
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
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
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (IMPORTANT: getUser()로 서버 검증)
  // undici fetch가 간헐적으로 hang하면 미들웨어 전체가 멈춰 모든 페이지가 무한 로딩됨.
  // 3초 타임아웃 → 실패로 간주(로그인 필요 처리)해 hang을 끊는다. signOut 타임아웃과 동일 패턴.
  const { data: { user: rawUser }, error: getUserError } = await Promise.race([
    supabase.auth.getUser(),
    new Promise<Awaited<ReturnType<typeof supabase.auth.getUser>>>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null },
            error: new Error("getUser timeout"),
          } as Awaited<ReturnType<typeof supabase.auth.getUser>>),
        3000
      )
    ),
  ]);

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
  const isProtected =
    PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix)) ||
    isMdDashboardPath(pathname);

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

    if ((pathname === "/admin" || pathname.startsWith("/admin/")) && profile?.role !== "admin") {
      console.warn(`[Middleware] Admin 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
      return NextResponse.redirect(new URL("/", request.url));
    }
    // MD 역할 체크는 대시보드 경로에만. /md/apply는 로그인만 필요(역할 무관),
    // /md/<slug> 공개 프로필은 애초에 isProtected가 아니라 여기 오지 않는다.
    if (isMdDashboardPath(pathname) && profile?.role !== "md" && profile?.role !== "admin") {
      console.warn(`[Middleware] MD 접근 거부 - userId: ${user.id}, role: ${profile?.role}, path: ${pathname}`);
      return NextResponse.redirect(new URL("/", request.url));
    }

    // page.tsx에서 재조회하지 않도록 결과를 헤더로 전달
    supabaseResponse.headers.set("x-user-id", user.id);
    supabaseResponse.headers.set("x-user-role", profile?.role ?? "");
  }

  return supabaseResponse;
}
