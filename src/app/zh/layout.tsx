import type { Metadata } from "next";

// /zh 하위 전체에 중국어 SEO 기본값 + html lang 중국어 안내.
// 중국·대만·홍콩 관광객 검색·공유에서 한글·영어 기본값이 노출되지 않도록 차단.
export const metadata: Metadata = {
  title: {
    default: "韩国夜店预订 — 江南·弘大·梨泰院 (NightFlow 首尔)",
    template: "%s — NightFlow 韩国",
  },
  description:
    "首尔最佳夜店预订 — 江南·弘大·梨泰院·狎鸥亭 VIP 包间。无需韩语，真实价格，无中介。专为外国旅客打造的韩国夜生活预订平台。",
  alternates: {
    languages: {
      "zh-CN": "https://nightflow.kr/zh",
      "zh-TW": "https://nightflow.kr/zh",
      "ko-KR": "https://nightflow.kr",
      "en-US": "https://nightflow.kr/en",
      "x-default": "https://nightflow.kr",
    },
  },
  openGraph: {
    locale: "zh_CN",
    siteName: "NightFlow",
    type: "website",
  },
};

export default function ZhLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div lang="zh">{children}</div>;
}
