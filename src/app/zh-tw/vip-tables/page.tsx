import type { Metadata } from "next";
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";

export const metadata: Metadata = {
  title: {
    absolute:
      "首爾 VIP 包廂預訂 — 韓國夜店瓶裝服務指南 (2026)",
  },
  description:
    "預訂首爾頂級夜店 VIP 包廂 — 江南、弘大、梨泰院、狎鷗亭。真實價格,瓶裝服務,無中介,無需韓語。韓國在地人的預訂方式。",
  keywords: [
    "首爾VIP包廂",
    "首爾VIP預訂",
    "首爾瓶裝服務",
    "首爾VIP夜店",
    "韓國VIP包廂",
    "韓國VIP預訂",
    "韓國瓶裝服務",
    "江南VIP包廂",
    "江南VIP預訂",
    "江南瓶裝服務",
    "狎鷗亭VIP",
    "狎鷗亭包廂",
    "清潭VIP",
    "清潭包廂",
    "韓國夜店包廂",
    "首爾夜店包廂",
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
    title: "首爾 VIP 包廂預訂 — 韓國夜店瓶裝服務指南",
    description: "預訂首爾頂級夜店,無需韓語。真實價格,無中介。",
    url: "https://nightflow.kr/zh-tw/vip-tables",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

const TIERS = [
  { name: "弘大 walk-in 友善", price: "₩400,000–600,000", perPerson: "每人 ₩70,000–100,000 (6 人)", desc: "中小型夜店,嘻哈/K-POP 為主,無嚴格門禁。Club Dokkaebi、Sabotage、Purple。" },
  { name: "江南主桌 VIP", price: "₩750,000–1,500,000", perPerson: "每人 ₩150,000–300,000 (4–6 人)", desc: "EDM 大型夜店,黃金座位,全套瓶裝服務。Club ACE、Massive、Club Pop。" },
  { name: "狎鷗亭高端包廂", price: "₩2,000,000+", perPerson: "每人 ₩400,000+ (4–6 人)", desc: "高端包廂,香檳文化,獨家人群。Core Lounge、Club Arzu、DM Seoul。" },
];

export default function ZhTwVipTablesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首爾 VIP 包廂預訂",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" },
        areaServed: { "@type": "City", name: "首爾" },
        description: "預訂首爾頂級夜店 VIP 包廂和瓶裝服務,江南、弘大、梨泰院、狎鷗亭。中文友善,無中介,韓國在地價。",
        serviceType: "VIP Table Reservation",
        offers: TIERS.map((t) => ({ "@type": "Offer", name: t.name, description: t.desc, priceRange: t.price })),
      },
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
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首爾 VIP 包廂預訂</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            預訂首爾頂級夜店 VIP 包廂和瓶裝服務 — 江南、弘大、梨泰院、狎鷗亭。無中介,無需韓語,無旅客加價。
          </p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">首爾 VIP 包廂級別</h2>
          <div className="space-y-3">
            {TIERS.map((t) => (
              <div key={t.name} className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="font-bold text-[15px] text-foreground">{t.name}</p>
                  <p className="font-black text-[14px] text-brand-amber whitespace-nowrap">{t.price}</p>
                </div>
                <p className="text-[12px] text-muted-foreground">{t.perPerson}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">VIP 預訂流程</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            選好想去的夜店(或者只告訴我們喜好),填寫日期、人數和預算。NightFlow 直接聯絡夜店,為您鎖定預算內最好的桌位 — 真實價格,真實瓶裝套餐。到場後直接入場。
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
