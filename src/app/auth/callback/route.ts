import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  // Host 헤더로 실제 브라우저 origin 확정 (Next.js dev 서버를 -H 0.0.0.0으로 실행 시
  // request.url.origin이 0.0.0.0:3000으로 잡혀 쿠키 도메인이 엇갈리는 문제 방지)
  const hostHeader = request.headers.get("host");
  const origin = hostHeader
    ? `${requestUrl.protocol}//${hostHeader}`
    : requestUrl.origin;
  const code = searchParams.get("code");
  const langParam = searchParams.get("lang"); // 정규화 전에 캡처
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
  const provider = (user.app_metadata?.provider as string) || "kakao";

  let redirectUrl = `${origin}${safeNext}`;

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("id, deleted_at, country_code")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // 신규 유저 → 회원가입 페이지로
      const signupUrl = new URL("/signup", origin);

      // safeNext에서 lang 파라미터 추출해서 signup으로 직접 전달
      let cleanNext = safeNext;
      try {
        const parsedNext = new URL(safeNext, origin);
        const lang = parsedNext.searchParams.get("lang");
        if (lang) {
          signupUrl.searchParams.set("lang", lang);
          parsedNext.searchParams.delete("lang");
          cleanNext = parsedNext.pathname + (parsedNext.search || "");
        }
      } catch {}

      if (cleanNext !== "/" && cleanNext !== "") signupUrl.searchParams.set("next", cleanNext);
      signupUrl.searchParams.set("auth_success", `signup_${provider}`);
      redirectUrl = signupUrl.toString();
    } else if (profile.deleted_at) {
      redirectUrl = `${origin}/recover-account`;
    } else {
      // 기존 유저 로그인 — 외국인은 /en으로
      // country_code 있거나, next에 lang=en이 포함된 경우 외국인으로 판단
      const foreignLang =
        langParam && langParam !== "ko"
          ? langParam
          : (safeNext.match(/lang=(en|ja|zh)/)?.[1] ?? null);
      // country_code='KR'은 한국인(/en 트랙 유입 후 대한민국 선택)이므로 외국인에서 제외.
      const isForeigner =
        (profile.country_code != null && profile.country_code !== "" && profile.country_code !== "KR") ||
        foreignLang != null;
      // next가 의미있는 목적지(단순 루트+lang= 제외)가 아닐 때만 /en으로
      const isDefaultNext =
        safeNext === "/" ||
        safeNext === "" ||
        /^\/?(\?.*)?$/.test(safeNext); // /, /?foo=bar 형태
      if (isForeigner && isDefaultNext) {
        // 외국어(ja/zh) 유지, 없으면 영어 기본
        redirectUrl = `${origin}/en?lang=${foreignLang ?? "en"}`;
      }
    }
  }

  // 진단용: 콜백이 설정한 쿠키 개수를 URL에 기록 (_s=쿠키수)
  const alreadyHasAuthSuccess = redirectUrl.includes("auth_success=");
  const separator = redirectUrl.includes("?") ? "&" : "?";
  const urlWithDiag = alreadyHasAuthSuccess
    ? `${redirectUrl}${separator}_s=${cookiesToSet.length}`
    : `${redirectUrl}${separator}_s=${cookiesToSet.length}&auth_success=login_${provider}`;

  const response = NextResponse.redirect(urlWithDiag);
  // 교환된 세션 쿠키를 Response에 직접 첨부 (모바일 핵심)
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
