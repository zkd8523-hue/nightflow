import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Accept-Language 헤더에서 최선 언어를 서버 사이드로 감지.
// LangAutoRedirect(useEffect 기반)는 첫 프레임 지연 + 인앱 브라우저에서 실패.
// 미들웨어는 첫 응답 전에 302 리디렉트 → 유저는 한국어 홈을 아예 못 봄.
//
// 근거 사례:
// - 프랑스 유저 Maeve (fr-FR) direct → 한국어 홈 랜딩 (2026-07-07 15:06)
// - 미국인 Ahsan 유사 케이스 (앞선 세션 분석)
// - 두 케이스 다 인앱 브라우저 → 클라이언트 useEffect 지연
//
// 매핑:
//   fr, es, de, it, pt, ru, ... → /en (영어권 폴백)
//   ja → /ja
//   zh-TW, zh-HK, zh-Hant → /zh-tw
//   zh → /zh
//   ko → / (유지)
function pickForeignRoute(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;

  // Accept-Language 파싱. 예: "fr-FR,fr;q=0.9,en;q=0.8"
  const preferences = acceptLanguage
    .split(",")
    .map((p) => {
      const [tag, qPart] = p.trim().split(";");
      const q = qPart?.startsWith("q=") ? parseFloat(qPart.slice(2)) : 1;
      return { tag: tag.toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferences) {
    if (tag.startsWith("ko")) return null; // 한국어는 리디렉트 X
    if (tag.startsWith("ja")) return "/ja";
    if (tag === "zh-tw" || tag === "zh-hk" || tag === "zh-hant"
      || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-hant")) {
      return "/zh-tw";
    }
    if (tag.startsWith("zh")) return "/zh";
    // 그 외 모든 언어는 영어로 폴백 (en, fr, es, de, it, pt, ru, ar, hi 등)
    if (/^[a-z]{2,3}(-|$)/.test(tag)) return "/en";
  }
  return null;
}

// 봇 UA 목록. 검색엔진은 항상 canonical(/, /en 등) 그대로 크롤해야 함.
// 리디렉트하면 SEO 색인 왜곡. hreflang은 서버 응답으로만 판단해야 함.
const BOT_UA_REGEX = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|ia_archiver|naverbot|yeti|twitterbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|discordbot|slackbot/i;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 루트 페이지 접근 시 Accept-Language 기반 자동 리디렉트 (봇 제외)
  // 이미 리디렉트된 세션은 nf_lang_redirected 쿠키로 스킵 (사용자 수동 복귀 존중)
  if (pathname === "/") {
    const ua = request.headers.get("user-agent") || "";
    const isBot = BOT_UA_REGEX.test(ua);
    const alreadyRedirected = request.cookies.get("nf_lang_redirected")?.value === "1";
    const acceptLang = request.headers.get("accept-language");
    const target = !isBot && !alreadyRedirected ? pickForeignRoute(acceptLang) : null;

    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      const redirect = NextResponse.redirect(url, 302);
      // 세션당 1회만 튕김. 유저가 수동으로 /로 돌아오면 그 세션 존중.
      redirect.cookies.set("nf_lang_redirected", "1", {
        path: "/",
        maxAge: 60 * 60 * 6, // 6시간
        sameSite: "lax",
      });
      return redirect;
    }
  }

  // 루트 레이아웃에서 <html lang> 동적 결정용으로 request 헤더에 pathname 주입.
  // request.headers를 mutate하면 downstream(supabase middleware, 서버 컴포넌트)에서 next/headers로 읽을 수 있음.
  request.headers.set("x-pathname", pathname);
  const response = await updateSession(request);
  // 응답에도 Content-Language 힌트 (Googlebot용)
  const lang = pathname.startsWith("/en") ? "en-US"
    : pathname.startsWith("/zh-tw") ? "zh-TW"
    : pathname.startsWith("/zh") ? "zh-CN"
    : pathname.startsWith("/ja") ? "ja-JP"
    : "ko-KR";
  response.headers.set("Content-Language", lang);
  return response;
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 매칭:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     * - sitemap.xml, robots.txt (SEO 메타파일 — 구글봇이 직접 가져가야 함)
     * - 이미지 파일들
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
