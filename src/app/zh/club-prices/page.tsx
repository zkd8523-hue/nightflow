import type { Metadata } from "next";
import { ClubPricesPage } from "@/components/foreign/ClubPricesPage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "首尔夜店入场费 2026 — 韩国夜店一晚要花多少钱?" },
  description:
    "50家首尔夜店的真实入场费。大多数₩10,000–20,000,不少免费入场。江南、弘大、梨泰院、釜山分区对比,以及卡座的真实价格。",
  keywords: [
    "首尔夜店入场费", "韩国夜店多少钱", "首尔夜店价格",
    "韩国夜店消费", "首尔夜店一晚多少钱", "韩国夜店门票",
    "江南夜店入场费", "弘大夜店入场费", "梨泰院夜店入场费",
    "釜山夜店入场费", "首尔夜店免费入场", "首尔夜店卡座价格",
    "韩国夜店预算", "首尔夜店便宜",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/club-prices",
    languages: {
      "en-US": "https://nightflow.kr/en/club-prices",
      "ja-JP": "https://nightflow.kr/ja/club-prices",
      "zh-CN": "https://nightflow.kr/zh/club-prices",
      "zh-TW": "https://nightflow.kr/zh-tw/club-prices",
      "x-default": "https://nightflow.kr/en/club-prices",
    },
  },
  openGraph: {
    title: "首尔夜店入场费 2026 — 真实价格,不是估算",
    description: "核实过的50家夜店入场费。大多数₩10,000–20,000,不少免费。",
    url: "https://nightflow.kr/zh/club-prices",
    locale: "zh_CN",
    type: "article",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function Page() {
  return <ClubPricesPage lang="zh" />;
}
