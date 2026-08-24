import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gonePageHtml } from "@/lib/http/gonePage";

// /flags/<uuid> 상세만 매칭 — /flags/new, /flags/<id>/edit, /flags/<id>/review 는 제외.
const FLAG_DETAIL_RE =
  /^\/flags\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  "/md/coupons",
  "/md/credits",
  "/md/dashboard",
  "/md/floor-plan",
  "/md/hotdeal",
  "/md/settings",
  "/md/share-slots",
  "/md/transactions",
  "/md/vip",
];

// 접두사가 다른 경로를 삼키지 않도록 정확 일치 또는 하위 경로만 매칭
// ("/md/hotdeal" = 게스트 간판. 핫딜 폐기로 "/md/hotdeal-now"는 제거됨)
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

  const pathname = request.nextUrl.pathname;

  // 종료된 깃발(/flags/<uuid>) → 410 Gone.
  //
  // 깃발은 시한부라 sitemap에 실려 색인된 뒤 만료된다. 만료·취소되면 RLS가 익명 읽기를
  // 막아 page.tsx가 /login으로 307을 내보내는데, 307은 "임시 이동 — 원래 주소는 살려둬"라
  // 크롤러에게 잘못된 신호다(로그인 페이지엔 색인할 내용도 없다).
  // 410은 "영구히 사라짐"이라 색인에서 확실히 빠진다.
  //
  // 로그인한 사용자는 그대로 통과시킨다 — 본인 깃발이면 만료 뒤에도 볼 수 있어야 하고,
  // 익명일 때만 판정하므로 살아있는 깃발 공유 링크(익명 열람 가능)는 영향 없다.
  // page.tsx에서 못 하는 이유는 gonePage.ts 주석 참고(임의 상태코드 불가).
  if (!user && request.method === "GET" && FLAG_DETAIL_RE.test(pathname)) {
    const flagId = pathname.slice("/flags/".length);
    const { data: flag } = await supabase
      .from("puzzles")
      .select("id")
      .eq("id", flagId)
      .maybeSingle();
    // 익명이 못 읽는다 = 만료·취소됐거나 애초에 없는 깃발
    if (!flag) {
      return new NextResponse(
        gonePageHtml({
          title: "종료된 깃발이에요",
          message: "이 깃발은 마감되었거나 취소됐어요. 지금 열려 있는 깃발을 보러 가볼까요?",
          homeLabel: "홈으로",
          homeHref: "/",
        }),
        { status: 410, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
  }

  // 구 MD 프로필(/md/<slug>) → 통합 프로필(/u/<id>) 308 영구 리다이렉트.
  // page.tsx의 permanentRedirect()는 스트리밍 중이라 200 + 메타 리프레시(소프트 리다이렉트)로
  // 나가서 크롤러에게 약한 신호가 된다. 미들웨어에서 처리해야 진짜 308이 나간다.
  // 대시보드 경로와 /md/apply는 제외. 슬러그가 없으면 그냥 통과시켜 페이지가 404를 내게 둔다.
  if (
    pathname.startsWith("/md/") &&
    pathname !== "/md/apply" &&
    !isMdDashboardPath(pathname)
  ) {
    const slug = pathname.slice("/md/".length).split("/")[0];
    if (slug) {
      const { data: md } = await supabase
        .from("public_user_profiles")
        .select("id")
        .eq("md_unique_slug", decodeURIComponent(slug))
        .maybeSingle();
      if (md?.id) {
        const res = NextResponse.redirect(new URL(`/u/${md.id}`, request.url), 308);
        // MD 추천인 쿠키(7일) — 기존 /md/<slug> 페이지의 동작을 그대로 승계
        res.cookies.set("md_referrer", md.id, {
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
        });
        return res;
      }
    }
  }

  // 보호된 경로 접근 시 로그인 확인
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
