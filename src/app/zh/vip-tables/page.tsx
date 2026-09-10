import type { Metadata } from "next";

// 메뉴 가격이 바뀌면 1시간 내 반영. ⚠️ 컴포넌트 파일이 아니라 여기(route segment)에 있어야 동작한다.
export const revalidate = 3600;
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { RealTablePrices, fetchRealTablePrices, realTablePricesJsonLd, realTablePricesFaqs } from "@/components/foreign/RealTablePrices";

export const metadata: Metadata = {
  title: {
    absolute:
      "首尔夜店卡座价格 2026 — 23家真实酒单（50万韩元起）",
  },
  description:
    "首尔夜店卡座实际要花多少：梨泰院·弘大最低消费50万韩元，江南100万韩元，由各夜店真实酒单选酒凑满。含套餐实价与内容，无中介费。",
  keywords: [
    "首尔VIP卡座",
    "首尔VIP预订",
    "首尔瓶装服务",
    "首尔VIP夜店",
    "韩国VIP卡座",
    "韩国VIP预订",
    "韩国瓶装服务",
    "江南VIP卡座",
    "江南VIP预订",
    "江南瓶装服务",
    "狎鸥亭VIP",
    "狎鸥亭卡座",
    "清潭VIP",
    "清潭卡座",
    "韩国夜店卡座",
    "首尔夜店卡座",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/vip-tables",
    languages: {
        "en-US": "https://nightflow.kr/en/vip-tables",
        "zh-CN": "https://nightflow.kr/zh/vip-tables",
        "zh-TW": "https://nightflow.kr/zh-tw/vip-tables",
        "ja-JP": "https://nightflow.kr/ja/vip-tables",
        "x-default": "https://nightflow.kr/en/vip-tables",
    },
  },
  openGraph: {
    title: "首尔夜店卡座价格 2026 — 23家真实酒单（50万韩元起）",
    description: "首尔夜店卡座实际要花多少：梨泰院·弘大最低消费50万韩元，江南100万韩元，由各夜店真实酒单选酒凑满。含套餐实价与内容，无中介费。",
    url: "https://nightflow.kr/zh/vip-tables",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};


export default async function ZhVipTablesPage() {
  // 실가격 표(2026-09-10) — 정적 TIERS는 범위만 있어 AI·검색이 인용하지 않았다.
  const priceRows = await fetchRealTablePrices("zh");
  const priceLd = realTablePricesJsonLd(priceRows, "zh", "https://nightflow.kr/zh/vip-tables");
  const priceFaqs = realTablePricesFaqs(priceRows, "zh");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首尔 VIP 卡座预订",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh" },
        areaServed: { "@type": "City", name: "首尔" },
        description: "预订首尔顶级夜店 VIP 卡座和瓶装服务，江南、弘大、梨泰院、狎鸥亭。中文友好，无中介，韩国本地价。",
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
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" },
          { "@type": "ListItem", position: 2, name: "VIP 卡座", item: "https://nightflow.kr/zh/vip-tables" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="zh" meta={{ page: "vip-tables" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首尔夜店卡座价格</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            预订首尔顶级夜店 VIP 卡座和瓶装服务 — 江南、弘大、梨泰院、狎鸥亭。无中介，无需韩语，无游客加价。
          </p>
        </header>

        {/* 실제 세트 가격 — 위 티어(범위)와 달리 클럽별 실데이터. AI·검색이 인용할 사실. */}
        <RealTablePrices lang="zh" rows={priceRows} />

        {priceFaqs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black">首尔夜店卡座价格 — 常见问题</h2>
            {priceFaqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-[14px] font-bold text-foreground">{f.q}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed break-keep mt-0.5">{f.a}</p>
              </div>
            ))}
          </section>
        )}
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">VIP 预订流程</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            选好想去的夜店（或者只告诉我们喜好），填写日期、人数和预算。NightFlow 直接联系夜店，为您锁定预算内最好的桌位 — 真实价格，真实瓶装套餐。到场后直接入场。
          </p>
          <Link data-nf-track="book_cta" href="/flags/new?lang=zh" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            🍾 通过 NightFlow 预订
          </Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">按地区浏览</h2>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/zh/clubs/gangnam">江南 VIP 卡座 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/clubs/apgujeong">狎鸥亭 &amp; 清潭 VIP 卡座 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/clubs/hongdae">弘大 VIP &amp; walk-in 卡座 →</Link></li>
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
