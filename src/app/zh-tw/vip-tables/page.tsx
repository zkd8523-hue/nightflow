import type { Metadata } from "next";

// 메뉴 가격이 바뀌면 1시간 내 반영. ⚠️ 컴포넌트 파일이 아니라 여기(route segment)에 있어야 동작한다.
export const revalidate = 3600;
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd, realTablePricesFaqs } from "@/components/foreign/RealTablePrices";

export const metadata: Metadata = {
  title: {
    absolute:
      "首爾夜店包廂價格 2026 — 23家真實酒單（50萬韓元起）",
  },
  description:
    "首爾夜店包廂實際要花多少：梨泰院、弘大低消50萬韓元，江南100萬韓元，由各夜店真實酒單選酒湊滿。含套餐實價與內容，無中介費。",
  // 包廂 우선(대만 실측 어휘), 桌位는 보조로 유지.
  keywords: [
    "首爾夜店包廂",
    "首爾夜店包廂價格",
    "首爾VIP包廂",
    "首爾VIP預訂",
    "首爾瓶裝服務",
    "首爾VIP夜店",
    "韓國夜店包廂",
    "韓國VIP包廂",
    "韓國VIP預訂",
    "江南夜店包廂",
    "江南VIP包廂",
    "弘大夜店包廂",
    "梨泰院夜店包廂",
    "狎鷗亭VIP",
    "狎鷗亭包廂",
    "清潭VIP",
    "首爾夜店桌位",
    "首爾夜店低消",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/vip-tables",
    languages: {
        "en-US": "https://nightflow.kr/en/vip-tables",
        "zh-CN": "https://nightflow.kr/zh/vip-tables",
        "zh-TW": "https://nightflow.kr/zh-tw/vip-tables",
        "zh-Hant": "https://nightflow.kr/zh-tw/vip-tables",
        "zh-HK": "https://nightflow.kr/zh-tw/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: {
    title: "首爾夜店包廂價格 2026 — 23家真實酒單（50萬韓元起）",
    description: "首爾夜店包廂實際要花多少：梨泰院、弘大低消50萬韓元，江南100萬韓元，由各夜店真實酒單選酒湊滿。含套餐實價與內容，無中介費。",
    url: "https://nightflow.kr/zh-tw/vip-tables",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};


export default async function ZhTwVipTablesPage() {
  // 실가격 표(2026-09-10) — 정적 TIERS는 범위만 있어 AI·검색이 인용하지 않았다.
  const priceRows = await fetchRealTablePrices("zh-tw");
  const priceLd = realTablePricesJsonLd(priceRows, "zh-tw", "https://nightflow.kr/zh-tw/vip-tables");
  const priceFaqs = realTablePricesFaqs(priceRows, "zh-tw");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首爾 VIP 包廂預訂",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" },
        areaServed: { "@type": "City", name: "首爾" },
        description: "預訂首爾頂級夜店 VIP 包廂和瓶裝服務，江南、弘大、梨泰院、狎鷗亭。中文友善，無中介，韓國在地價。",
        serviceType: "VIP Table Reservation",
      },
      ...(priceLd ? [priceLd] : []),
      ...(priceFaqs.length
        ? [{
            "@type": "FAQPage",
            mainEntity: priceFaqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }]
        : []),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh-tw" },
          { "@type": "ListItem", position: 2, name: "VIP 包廂", item: "https://nightflow.kr/zh-tw/vip-tables" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="zh-tw" meta={{ page: "vip-tables" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh-tw" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首爾夜店包廂價格</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            預訂首爾頂級夜店 VIP 包廂和瓶裝服務 — 江南、弘大、梨泰院、狎鷗亭。無中介，無需韓語，無旅客加價。
          </p>
        </header>

        {/* 실제 세트 가격 — 위 티어(범위)와 달리 클럽별 실데이터. AI·검색이 인용할 사실. */}
        <RealTablePrices lang="zh-tw" rows={priceRows} />

        {priceFaqs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black">首爾夜店包廂價格 — 常見問題</h2>
            {priceFaqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-[14px] font-bold text-foreground">{f.q}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
              </div>
            ))}
          </section>
        )}
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">VIP 預訂流程</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            選好想去的夜店（或者只告訴我們喜好），填寫日期、人數和預算。NightFlow 直接聯絡夜店，為您鎖定預算內最好的包廂 — 真實價格，真實瓶裝套餐。到場後直接入場。
          </p>
          <Link data-nf-track="book_cta" href="/flags/new?lang=zh-tw" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            🍾 透過 NightFlow 預訂
          </Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">按地區瀏覽</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/zh-tw/clubs/gangnam">江南 VIP 包廂 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/clubs/apgujeong">狎鷗亭 &amp; 清潭 VIP 包廂 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/clubs/hongdae">弘大 VIP &amp; walk-in 包廂 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/clubs/itaewon">梨泰院國際化夜店 →</Link></li>
          </ul>
        </section>
        <section className="text-center pt-4">
          <Link href="/zh-tw/faq" className="text-[12px] text-blue-400 hover:underline">查看 FAQ →</Link>
        </section>
      </div>
    </div>
  );
}
