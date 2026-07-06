import type { Metadata } from "next";
import { CrawlerLangLinks } from "@/components/layout/CrawlerLangLinks";

// /zh-tw 하위 전체에 번체 중국어 (대만·홍콩) SEO 기본값.
// 대만·홍콩 유저 대상. 넷플릭스·Trip.com·KKday 스타일 대만식 번체.
// 광둥어 표현 X. 홍콩 유저도 대만식 번체 이해 가능 (업계 표준).
export const metadata: Metadata = {
  title: {
    default: "韓國夜店預訂 — 江南·弘大·梨泰院 (NightFlow 首爾)",
    template: "%s — NightFlow 韓國",
  },
  description:
    "首爾最佳夜店預訂 — 江南·弘大·梨泰院·狎鷗亭 VIP 包廂。無需韓語,真實價格,無中介。專為台灣·香港旅客打造的韓國夜生活預訂平台。",
  alternates: {
    languages: {
      "zh-TW": "https://nightflow.kr/zh-tw",
      "zh-HK": "https://nightflow.kr/zh-tw",
      "zh-Hant": "https://nightflow.kr/zh-tw",
      "zh-CN": "https://nightflow.kr/zh",
      "zh-Hans": "https://nightflow.kr/zh",
      "ko-KR": "https://nightflow.kr",
      "en-US": "https://nightflow.kr/en",
      "ja-JP": "https://nightflow.kr/ja",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    locale: "zh_TW",
    siteName: "NightFlow",
    type: "website",
  },
};

export default function ZhTwLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div lang="zh-TW">
      <CrawlerLangLinks />
      {children}
    </div>
  );
}
