import type { Metadata } from "next";
import { CrawlerLangLinks } from "@/components/layout/CrawlerLangLinks";

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
      "zh-Hans": "https://nightflow.kr/zh",
      "zh-TW": "https://nightflow.kr/zh-tw",
      "zh-HK": "https://nightflow.kr/zh-tw",
      "zh-Hant": "https://nightflow.kr/zh-tw",
      "ko-KR": "https://nightflow.kr",
      "en-US": "https://nightflow.kr/en",
      "ja-JP": "https://nightflow.kr/ja",
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
  // overscroll-none: 외국인 트랙 전체에서 pull-to-refresh를 끈다(2026-09-06).
  // 이유는 en/layout.tsx 주석 참조 — DrinkMenuViewer의 사진 1장짜리 케이스에서
  // 세로 드래그가 브라우저 새로고침으로 새는 걸 트랙 전체에서 차단한다.
  return (
    <div lang="zh" className="overscroll-none">
      <CrawlerLangLinks />
      {children}
    </div>
  );
}
