import type { Metadata } from "next";

// /en 하위 전체에 영어 SEO 기본값 + html lang 영어 안내.
// 외국인 검색·공유에서 한글 기본값(나플 등)이 노출되지 않도록 차단.
export const metadata: Metadata = {
  title: {
    default: "NightFlow — Seoul Club Booking for Travelers",
    template: "%s — NightFlow",
  },
  description:
    "Book the best clubs in Seoul without speaking Korean. Gangnam, Hongdae, Itaewon — real prices, VIP tables, no broker.",
  alternates: {
    languages: {
      "en-US": "https://nightflow.kr/en",
      "ko-KR": "https://nightflow.kr",
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
  return <div lang="en">{children}</div>;
}
