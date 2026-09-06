import type { Metadata } from "next";
import { CrawlerLangLinks } from "@/components/layout/CrawlerLangLinks";

// /ja 하위 전체에 일본어 SEO 기본값 + html lang 일본어 안내.
// 일본 관광객 검색·공유에서 한글·영어 기본값이 노출되지 않도록 차단.
export const metadata: Metadata = {
  title: {
    default: "韓国クラブ予約 — 江南・弘大・梨泰院 (NightFlow ソウル)",
    template: "%s — NightFlow 韓国",
  },
  description:
    "ソウルのベストクラブ予約 — 江南・弘大・梨泰院・狎鴎亭のVIPルーム。韓国語不要、本物の価格、ブローカーなし。日本人旅行者のための韓国ナイトライフ予約プラットフォーム。",
  alternates: {
    // zh-TW/zh-Hant 누락 — zh-tw layout은 ja를 링크하는데 여기서 되돌아가는 링크가
    // 없었다. zh/zh-tw/en과 맞춰 완전한 상호 링크로 채운다.
    languages: {
      "ja-JP": "https://nightflow.kr/ja",
      "ko-KR": "https://nightflow.kr",
      "en-US": "https://nightflow.kr/en",
      "zh-CN": "https://nightflow.kr/zh",
      "zh-Hans": "https://nightflow.kr/zh",
      "zh-TW": "https://nightflow.kr/zh-tw",
      "zh-HK": "https://nightflow.kr/zh-tw",
      "zh-Hant": "https://nightflow.kr/zh-tw",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    locale: "ja_JP",
    siteName: "NightFlow",
    type: "website",
  },
};

export default function JaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // overscroll-none: 외국인 트랙 전체에서 pull-to-refresh를 끈다(2026-09-06).
  // 이유는 en/layout.tsx 주석 참조 — DrinkMenuViewer의 사진 1장짜리 케이스에서
  // 세로 드래그가 브라우저 새로고침으로 새는 걸 트랙 전체에서 차단한다.
  return (
    <div lang="ja" className="overscroll-none">
      <CrawlerLangLinks />
      {children}
    </div>
  );
}
