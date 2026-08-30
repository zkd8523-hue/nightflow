import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首爾夜店 Guest List — 韓國夜店免費入場 (無需韓語)",
  },
  description:
    "透過 guest list 免費入場首爾頂級夜店 — 江南、弘大、梨泰院。跳過入場費。每週來自真實夜店 MD 的 guest 優惠。無中介,無需韓語。",
  keywords: [
    "首爾夜店 guest list",
    "首爾夜店免費入場",
    "首爾夜店入場費",
    "韓國夜店 guest list",
    "韓國夜店免費入場",
    "江南夜店 guest list",
    "弘大夜店 guest list",
    "梨泰院夜店 guest list",
    "首爾夜店 MD",
    "韓國夜店推廣員",
    "首爾夜店折扣",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/guests",
    languages: {
        "en-US": "https://nightflow.kr/en/guests",
        "zh-CN": "https://nightflow.kr/zh/guests",
        "zh-TW": "https://nightflow.kr/zh-tw/guests",
        "zh-Hant": "https://nightflow.kr/zh-tw/guests",
        "zh-HK": "https://nightflow.kr/zh-tw/guests",
        "ja-JP": "https://nightflow.kr/ja/guests",
        "x-default": "https://nightflow.kr/en/guests",
    },
  },
  openGraph: {
    title: "首爾夜店 Guest List — 韓國夜店免費入場",
    description: "跳過首爾頂級夜店的入場費。每週 guest 優惠,無需韓語。",
    url: "https://nightflow.kr/zh-tw/guests",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

export default function ZhTwGuestsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首爾夜店 Guest List",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" },
        areaServed: { "@type": "City", name: "首爾" },
        description: "來自真實首爾夜店 MD 的每週 guest list 優惠。江南、弘大、梨泰院夜店免費或折扣入場。繁體中文友善。",
        serviceType: "Club Guest List",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh-tw" },
          { "@type": "ListItem", position: 2, name: "Guest List", item: "https://nightflow.kr/zh-tw/guests" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh-tw" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首爾夜店 Guest List</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            跳過首爾頂級夜店的入場費。來自真實 MD 的每週 guest 優惠 — 免費入場、折扣入場、免費飲品券。無需韓語,無中介。
          </p>
        </header>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">什麼是首爾夜店 Guest List?</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            韓國夜店 MD(推廣員)經營每週 guest list — 通常在特定時間前免費或折扣入場。本地人用這種方式避開 ₩20,000–30,000 入場費。難點:傳統上需要透過 Instagram 或 KakaoTalk 聯絡韓國 MD。
          </p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            NightFlow 將江南、弘大、梨泰院夜店每週的 guest 優惠匯集一處 — 繁體中文介面,一鍵複製貼上訊息發給各 MD。
          </p>
        </section>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">您可獲得什麼</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• 特定時間前免費入場(通常到午夜 12 點)</li>
            <li>• 免費時段後入場費折扣</li>
            <li>• 部分夜店免費飲品券</li>
            <li>• 優先入場(跳過常規排隊)</li>
            <li>• 每週更新 — 每週一上新</li>
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">如何使用首爾 Guest List</h2>
          <ol className="space-y-2 text-[13px] text-foreground/80 list-decimal pl-5">
            <li>在 NightFlow 瀏覽每週 guest 優惠</li>
            <li>挑選夜店 — 江南、弘大或梨泰院</li>
            <li>點擊"複製訊息" — 預寫好的繁體中文/英文請求</li>
            <li>貼上到 MD 的 Instagram DM</li>
            <li>獲得確認 — 您的名字上 list</li>
            <li>到夜店,直接入場</li>
          </ol>
        </section>
        <section className="text-center pt-4 space-y-3">
          <Link href="/zh-tw/clubs" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            查看本週 guest 優惠 →
          </Link>
          <Link href="/zh-tw/faq" className="text-[12px] text-blue-400 hover:underline">查看 FAQ →</Link>
        </section>
      </div>
    </div>
  );
}
