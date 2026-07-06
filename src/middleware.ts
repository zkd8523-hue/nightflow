import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // 루트 레이아웃에서 <html lang> 동적 결정용으로 request 헤더에 pathname 주입.
  // request.headers를 mutate하면 downstream(supabase middleware, 서버 컴포넌트)에서 next/headers로 읽을 수 있음.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  const response = await updateSession(request);
  // 응답에도 Content-Language 힌트 (Googlebot용)
  const pathname = request.nextUrl.pathname;
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
