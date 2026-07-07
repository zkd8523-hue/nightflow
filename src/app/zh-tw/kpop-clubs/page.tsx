import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首爾 K-POP 夜店 — 哪裡能聽 K-POP 現場 (台灣旅客指南 2026)",
  },
  description:
    "首爾最佳 K-POP 夜店和夜生活指南，專為台灣 K-POP 粉絲整理。弘大 NB2、K-POP 舞會、偶像金曲整夜。真實價格，無中介，中文友善。",
  keywords: [
    "K-POP夜店",
    "K-POP夜店首爾",
    "首爾K-POP夜店",
    "首爾K-POP夜生活",
    "韓國K-POP夜店",
    "韓國K-POP夜生活",
    "弘大K-POP夜店",
    "NB2 首爾",
    "NB2 弘大",
    "K-POP酒吧",
    "K-POP舞蹈夜店",
    "首爾偶像夜店",
    "BTS夜店首爾",
    "K-POP粉絲夜店",
    "K-POP旅遊首爾",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/kpop-clubs",
    languages: {
        "en-US": "https://nightflow.kr/en/kpop-clubs",
        "zh-CN": "https://nightflow.kr/zh/kpop-clubs",
        "zh-TW": "https://nightflow.kr/zh-tw/kpop-clubs",
        "zh-Hant": "https://nightflow.kr/zh-tw/kpop-clubs",
        "zh-HK": "https://nightflow.kr/zh-tw/kpop-clubs",
        "ja-JP": "https://nightflow.kr/ja/kpop-clubs",
        "x-default": "https://nightflow.kr/en/kpop-clubs",
    },
  },
  openGraph: {
    title: "首爾 K-POP 夜店 — 台灣旅客指南",
    description: "首爾最佳 K-POP 夜店。真實價格，中文友善。K-POP 粉絲真正會去的地方。",
    url: "https://nightflow.kr/zh-tw/kpop-clubs",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const KPOP_VENUES = [
  { name: "NB2 (Noise Basement 2)", district: "弘大", vibe: "指標性 K-POP 夜店。YG 旗下，嘻哈+K-POP 金曲整夜。首爾國際旅客集中度最高。", bestFor: "首次訪韓 K-POP 粉絲旅客" },
  { name: "Club Purple", district: "弘大", vibe: "嘻哈為主，但 K-POP 金曲頻繁播放。新手友善，無嚴格門禁。", bestFor: "嘻哈 + K-POP 隨性夜" },
  { name: "Club ACE", district: "江南", vibe: "大型 EDM 夜店，繁忙夜晚設 K-POP 樓層。時尚人群，有服裝要求。", bestFor: "EDM + K-POP 結合夜" },
  { name: "Club Dokkaebi", district: "弘大", vibe: "嘻哈為主，但定期播放 K-POP 金曲。高端製作，氣氛熱烈。", bestFor: "同時喜歡嘻哈的 K-POP 粉絲" },
];

export default function ZhTwKpopClubsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "首爾 K-POP 夜店",
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
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh-tw" },
          { "@type": "ListItem", position: 2, name: "K-POP 夜店", item: "https://nightflow.kr/zh-tw/kpop-clubs" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh-tw" className="text-[12px] text-neutral-500 hover:text-white">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首爾 K-POP 夜店</h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            K-POP 粉絲真正會去首爾的地方。整夜播放偶像金曲的夜店誠實指南 — 弘大、江南、真實價格、中文友善場所。
          </p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">首爾頂級 K-POP 夜店</h2>
          <div className="space-y-3">
            {KPOP_VENUES.map((v) => (
              <div key={v.name} className="p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-[15px] text-neutral-100">{v.name}</p>
                  <p className="text-[12px] text-neutral-500">{v.district}</p>
                </div>
                <p className="text-[13px] text-neutral-400 leading-relaxed">{v.vibe}</p>
                <p className="text-[12px] text-amber-400">最適合: {v.bestFor}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">K-POP 旅客預訂建議</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            大多數 K-POP 旅客直接前往弘大 NB2。可行 — 但週末排隊可能 90 分鐘。如果您想確保入場並預訂包廂，在 NightFlow 插旗，弘大 K-POP 夜店會向您發送中文 VIP 報價。
          </p>
          <Link href="/zh-tw" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors">
            🚩 插旗 — 獲取 K-POP 夜店報價
          </Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">相關指南</h2>
          <ul className="space-y-1 text-[13px] text-neutral-400">
            <li><Link className="hover:text-white" href="/zh-tw/clubs/hongdae">弘大夜店 — 完整指南 →</Link></li>
            <li><Link className="hover:text-white" href="/zh-tw/clubs/gangnam">江南夜店 — 完整指南 →</Link></li>
            <li><Link className="hover:text-white" href="/zh-tw/vip-tables">首爾 VIP 包廂預訂 →</Link></li>
            <li><Link className="hover:text-white" href="/zh-tw/faq">首爾夜店 FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
