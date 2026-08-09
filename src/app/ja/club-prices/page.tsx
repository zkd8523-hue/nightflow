import type { Metadata } from "next";
import { ClubPricesPage } from "@/components/foreign/ClubPricesPage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "ソウルのクラブ入場料 2026 — 韓国のクラブはいくらかかる？" },
  description:
    "実際に確認した50店の入場料。ほとんどが₩10,000〜20,000で、無料の店も多数。江南・弘大・梨泰院・釜山をエリア別に比較。テーブル料金の相場も。",
  keywords: [
    "ソウル クラブ 入場料", "韓国 クラブ 料金", "韓国 クラブ 相場",
    "ソウル クラブ いくら", "ソウル クラブ 値段", "韓国 クラブ 費用",
    "江南 クラブ 入場料", "弘大 クラブ 入場料", "梨泰院 クラブ 入場料",
    "釜山 クラブ 入場料", "ソウル クラブ 無料", "韓国 クラブ 予算",
    "ソウル クラブ テーブル 料金", "韓国 ナイトクラブ 料金",
  ],
  alternates: {
    canonical: "https://nightflow.kr/ja/club-prices",
    languages: {
      "en-US": "https://nightflow.kr/en/club-prices",
      "ja-JP": "https://nightflow.kr/ja/club-prices",
      "zh-CN": "https://nightflow.kr/zh/club-prices",
      "zh-TW": "https://nightflow.kr/zh-tw/club-prices",
      "x-default": "https://nightflow.kr/en/club-prices",
    },
  },
  openGraph: {
    title: "ソウルのクラブ入場料 2026 — 推定ではなく実際の数字",
    description: "確認済み50店の入場料。ほとんどが₩10,000〜20,000、無料の店も多数。",
    url: "https://nightflow.kr/ja/club-prices",
    locale: "ja_JP",
    type: "article",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function Page() {
  return <ClubPricesPage lang="ja" />;
}
