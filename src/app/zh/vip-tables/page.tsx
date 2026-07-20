import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首尔 VIP 包间预订 — 韩国夜店瓶装服务指南 (2026)",
  },
  description:
    "预订首尔顶级夜店 VIP 包间 — 江南、弘大、梨泰院、狎鸥亭。真实价格，瓶装服务，无中介，无需韩语。韩国本地人的预订方式。",
  keywords: [
    "首尔VIP包间",
    "首尔VIP预订",
    "首尔瓶装服务",
    "首尔VIP夜店",
    "韩国VIP包间",
    "韩国VIP预订",
    "韩国瓶装服务",
    "江南VIP包间",
    "江南VIP预订",
    "江南瓶装服务",
    "狎鸥亭VIP",
    "狎鸥亭包间",
    "清潭VIP",
    "清潭包间",
    "韩国夜店包间",
    "首尔夜店包间",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/vip-tables",
    languages: {
        "en-US": "https://nightflow.kr/en/vip-tables",
        "zh-CN": "https://nightflow.kr/zh/vip-tables",
        "zh-TW": "https://nightflow.kr/zh/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: {
    title: "首尔 VIP 包间预订 — 韩国夜店瓶装服务指南",
    description: "预订首尔顶级夜店，无需韩语。真实价格，无中介。",
    url: "https://nightflow.kr/zh/vip-tables",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const TIERS = [
  { name: "弘大 walk-in 友好", price: "₩300,000–600,000", perPerson: "人均 ₩50,000–100,000 (6 人)", desc: "中小型夜店，嘻哈/K-POP 为主，无严格门控。Club Dokkaebi、Sabotage、Purple。" },
  { name: "江南主桌 VIP", price: "₩750,000–1,500,000", perPerson: "人均 ₩150,000–300,000 (4–6 人)", desc: "EDM 大型夜店，黄金座位，全套瓶装服务。Club ACE、Massive、Club Pop。" },
  { name: "狎鸥亭高端包间", price: "₩2,000,000+", perPerson: "人均 ₩400,000+ (4–6 人)", desc: "高端包间，香槟文化，独家人群。Core Lounge、Club Arzu、DM Seoul。" },
];

export default function ZhVipTablesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首尔 VIP 包间预订",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh" },
        areaServed: { "@type": "City", name: "首尔" },
        description: "预订首尔顶级夜店 VIP 包间和瓶装服务，江南、弘大、梨泰院、狎鸥亭。中文友好，无中介，韩国本地价。",
        serviceType: "VIP Table Reservation",
        offers: TIERS.map((t) => ({ "@type": "Offer", name: t.name, description: t.desc, priceRange: t.price })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" },
          { "@type": "ListItem", position: 2, name: "VIP 包间", item: "https://nightflow.kr/zh/vip-tables" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首尔 VIP 包间预订</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            预订首尔顶级夜店 VIP 包间和瓶装服务 — 江南、弘大、梨泰院、狎鸥亭。无中介，无需韩语，无游客加价。
          </p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">首尔 VIP 包间级别</h2>
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
          <h2 className="text-[20px] font-black">VIP 预订流程</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            选好想去的夜店（或者只告诉我们喜好），填写日期、人数和预算。NightFlow 直接联系夜店，为您锁定预算内最好的桌位 — 真实价格，真实瓶装套餐。到场后直接入场。
          </p>
          <Link href="/zh" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            🍾 通过 NightFlow 预订
          </Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">按地区浏览</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/zh/clubs/gangnam">江南 VIP 包间 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/clubs/apgujeong">狎鸥亭 &amp; 清潭 VIP 包间 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/clubs/hongdae">弘大 VIP &amp; walk-in 包间 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/clubs/itaewon">梨泰院国际化夜店 →</Link></li>
          </ul>
        </section>
        <section className="text-center pt-4">
          <Link href="/zh/faq" className="text-[12px] text-blue-400 hover:underline">查看 FAQ →</Link>
        </section>
      </div>
    </div>
  );
}
