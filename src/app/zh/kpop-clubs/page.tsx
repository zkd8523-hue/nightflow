import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首尔 K-POP 夜店 — 哪里能听 K-POP 现场 (中国游客指南 2026)",
  },
  description:
    "首尔最佳 K-POP 夜店和夜生活指南，专为中国 K-POP 粉丝整理。弘大 NB2、K-POP 舞会、偶像金曲整夜。真实价格，无中介，中文友好。",
  keywords: [
    "K-POP夜店",
    "K-POP夜店首尔",
    "首尔K-POP夜店",
    "首尔K-POP夜生活",
    "韩国K-POP夜店",
    "韩国K-POP夜生活",
    "弘大K-POP夜店",
    "NB2 首尔",
    "NB2 弘大",
    "K-POP酒吧",
    "K-POP舞蹈夜店",
    "首尔偶像夜店",
    "BTS夜店首尔",
    "K-POP粉丝夜店",
    "K-POP旅游首尔",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/kpop-clubs",
    languages: {
        "en-US": "https://nightflow.kr/en/kpop-clubs",
        "zh-CN": "https://nightflow.kr/zh/kpop-clubs",
        "zh-TW": "https://nightflow.kr/zh/kpop-clubs",
        "ja-JP": "https://nightflow.kr/ja/kpop-clubs",
        "x-default": "https://nightflow.kr/en/kpop-clubs",
    },
  },
  openGraph: {
    title: "首尔 K-POP 夜店 — 中国游客指南",
    description: "首尔最佳 K-POP 夜店。真实价格，中文友好。K-POP 粉丝真正去的地方。",
    url: "https://nightflow.kr/zh/kpop-clubs",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const KPOP_VENUES = [
  { name: "NB2 (Noise Basement 2)", district: "弘大", vibe: "标志性 K-POP 夜店。YG 旗下，嘻哈+K-POP 金曲整夜。首尔国际游客集中度最高。", bestFor: "首次访韩 K-POP 粉丝游客" },
  { name: "Club Purple", district: "弘大", vibe: "嘻哈为主，但 K-POP 金曲频繁播放。新手友好，无严格门控。", bestFor: "嘻哈 + K-POP 随性夜" },
  { name: "Club ACE", district: "江南", vibe: "大型 EDM 夜店，繁忙夜晚设 K-POP 楼层。时尚人群，有着装要求。", bestFor: "EDM + K-POP 结合夜" },
  { name: "Club Dokkaebi", district: "弘大", vibe: "嘻哈为主，但定期播放 K-POP 金曲。高端制作，氛围热烈。", bestFor: "同时喜欢嘻哈的 K-POP 粉丝" },
];

export default function ZhKpopClubsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "首尔 K-POP 夜店",
        numberOfItems: KPOP_VENUES.length,
        itemListElement: KPOP_VENUES.map((v, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "NightClub",
            name: v.name,
            address: { "@type": "PostalAddress", addressLocality: v.district, addressCountry: "KR" },
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" },
          { "@type": "ListItem", position: 2, name: "K-POP 夜店", item: "https://nightflow.kr/zh/kpop-clubs" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh" className="text-[12px] text-neutral-500 hover:text-white">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首尔 K-POP 夜店</h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            K-POP 粉丝真正去首尔的地方。整夜播放偶像金曲的夜店诚实指南 — 弘大、江南、真实价格、中文友好场所。
          </p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">首尔顶级 K-POP 夜店</h2>
          <div className="space-y-3">
            {KPOP_VENUES.map((v) => (
              <div key={v.name} className="p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-[15px] text-neutral-100">{v.name}</p>
                  <p className="text-[12px] text-neutral-500">{v.district}</p>
                </div>
                <p className="text-[13px] text-neutral-400 leading-relaxed">{v.vibe}</p>
                <p className="text-[12px] text-amber-400">最适合: {v.bestFor}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">K-POP 游客预订建议</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            大多数 K-POP 游客直接前往弘大 NB2。可行 — 但周末排队可能 90 分钟。如果您想保证入场和预订包间，通过 NightFlow 预订，我们会直接联系弘大 K-POP 夜店，用中文为您确认座位。
          </p>
          <Link href="/zh" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors">
            🍾 通过 NightFlow 预订
          </Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">相关指南</h2>
          <ul className="space-y-1 text-[13px] text-neutral-400">
            <li><Link className="hover:text-white" href="/zh/clubs/hongdae">弘大夜店 — 完整指南 →</Link></li>
            <li><Link className="hover:text-white" href="/zh/clubs/gangnam">江南夜店 — 完整指南 →</Link></li>
            <li><Link className="hover:text-white" href="/zh/vip-tables">首尔 VIP 包间预订 →</Link></li>
            <li><Link className="hover:text-white" href="/zh/faq">首尔夜店 FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
