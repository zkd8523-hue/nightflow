import type { Metadata } from "next";
import { CrawlerLangLinks } from "@/components/layout/CrawlerLangLinks";

// /en 하위 전체에 영어 SEO 기본값 + html lang 영어 안내.
// 외국인 검색·공유에서 한글 기본값(나플 등)이 노출되지 않도록 차단.
export const metadata: Metadata = {
  title: {
    default: "Korea Club Booking — Gangnam, Hongdae, Itaewon (NightFlow Seoul)",
    template: "%s — NightFlow Korea",
  },
  description:
    "Book Korea's best clubs in Seoul — Gangnam, Hongdae, Itaewon, Apgujeong VIP tables. No Korean needed, no broker. Korea nightlife made easy for travelers.",
  alternates: {
    // zh/zh-tw/ja layout은 서로 + en + ko를 전부 상호 링크하는데 en만 ko만 링크했다.
    // hreflang은 양방향이 안 맞으면 구글이 그 관계 전체를 무시할 수 있어서, 트래픽이
    // 가장 큰(전체 세션의 절반) en 페이지가 정작 다른 언어판 존재를 신호하지 못했다.
    languages: {
      "en-US": "https://nightflow.kr/en",
      "ko-KR": "https://nightflow.kr",
      "ja-JP": "https://nightflow.kr/ja",
      "zh-CN": "https://nightflow.kr/zh",
      "zh-Hans": "https://nightflow.kr/zh",
      "zh-TW": "https://nightflow.kr/zh-tw",
      "zh-HK": "https://nightflow.kr/zh-tw",
      "zh-Hant": "https://nightflow.kr/zh-tw",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    locale: "en_US",
    siteName: "NightFlow",
    type: "website",
  },
};

export default function EnLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // html lang 자체를 바꾸진 못하지만(Next App Router 제약),
  // 안쪽 div에 lang="en" 명시 + meta로 콘텐츠 언어 신호를 영어로 강제.
  // 구글/브라우저 자동 번역기는 가장 가까운 lang 속성을 우선 인식.
  return (
    <div lang="en">
      <CrawlerLangLinks />
      {children}
    </div>
  );
}
