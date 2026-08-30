import type { Metadata } from "next";
import { ClubPricesPage } from "@/components/foreign/ClubPricesPage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Seoul Club Entry Fees 2026 — How Much Does a Club Cost in Korea?" },
  description:
    "Real entry fees from 50 verified Seoul clubs. Most charge ₩10,000–20,000 and many are free. Gangnam, Hongdae, Itaewon and Busan compared — plus what a VIP table actually costs.",
  keywords: [
    "Seoul club entry fee", "Seoul club cover charge", "how much is a club in Seoul",
    "Seoul club price", "Seoul nightclub cost", "Korea club entry fee",
    "Korean club price", "how much does clubbing cost in Korea",
    "Gangnam club entry fee", "Hongdae club entry fee", "Itaewon club entry fee",
    "Busan club entry fee", "Seoul club free entry", "Seoul club cheap",
    "Seoul club table price", "Korea club cover charge", "Seoul clubbing budget",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/club-prices",
    languages: {
      "en-US": "https://nightflow.kr/en/club-prices",
      "ja-JP": "https://nightflow.kr/ja/club-prices",
      "zh-CN": "https://nightflow.kr/zh/club-prices",
      "zh-TW": "https://nightflow.kr/zh-tw/club-prices",
      "x-default": "https://nightflow.kr/en/club-prices",
    },
  },
  openGraph: {
    title: "Seoul Club Entry Fees 2026 — Real Prices, Not Estimates",
    description: "Verified entry fees from 50 Seoul clubs. Most are ₩10,000–20,000, many are free.",
    url: "https://nightflow.kr/en/club-prices",
    locale: "en_US",
    type: "article",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

export default function Page() {
  return <ClubPricesPage lang="en" />;
}
