import type { Metadata } from "next";
import { ClubPricesPage } from "@/components/foreign/ClubPricesPage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "首爾夜店入場費 2026 — 韓國夜店一晚要花多少錢?" },
  description:
    "50家首爾夜店的真實入場費。大多數₩10,000–20,000,不少免費入場。江南、弘大、梨泰院、釜山分區比較,以及包廂的真實價格。",
  keywords: [
    "首爾夜店入場費", "韓國夜店多少錢", "首爾夜店價格",
    "韓國夜店消費", "首爾夜店一晚多少錢", "韓國夜店門票",
    "江南夜店入場費", "弘大夜店入場費", "梨泰院夜店入場費",
    "釜山夜店入場費", "首爾夜店免費入場", "首爾夜店包廂價格",
    "韓國夜店預算", "首爾夜店便宜",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/club-prices",
    languages: {
      "en-US": "https://nightflow.kr/en/club-prices",
      "ja-JP": "https://nightflow.kr/ja/club-prices",
      "zh-CN": "https://nightflow.kr/zh/club-prices",
      "zh-TW": "https://nightflow.kr/zh-tw/club-prices",
      "x-default": "https://nightflow.kr/en/club-prices",
    },
  },
  openGraph: {
    title: "首爾夜店入場費 2026 — 真實價格,不是估算",
    description: "核實過的50家夜店入場費。大多數₩10,000–20,000,不少免費。",
    url: "https://nightflow.kr/zh-tw/club-prices",
    locale: "zh_TW",
    type: "article",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

export default function Page() {
  return <ClubPricesPage lang="zh-tw" />;
}
