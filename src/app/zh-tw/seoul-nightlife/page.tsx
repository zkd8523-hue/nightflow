import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "首爾夜生活指南 2026 — 去哪裡、訂哪裡 (外國旅客版)" },
  description: "完整的首爾夜生活指南，專為外國旅客打造。江南 EDM、弘大嘻哈、梨泰院國際化、狎鷗亭 VIP 包廂。真實價格，無中介，無需韓語。",
  keywords: ["首爾夜生活","首爾夜生活指南","韓國夜生活","韓國夜生活指南","首爾夜場","首爾派對","首爾夜店","首爾最好的夜生活","首爾夜生活技巧","首爾夜生活區","江南夜生活","弘大夜生活","梨泰院夜生活","狎鷗亭夜生活","首爾酒吧和夜店","韓國旅遊夜生活"],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/seoul-nightlife",
    languages: {
        "en-US": "https://nightflow.kr/en/seoul-nightlife",
        "zh-CN": "https://nightflow.kr/zh/seoul-nightlife",
        "zh-TW": "https://nightflow.kr/zh-tw/seoul-nightlife",
        "zh-Hant": "https://nightflow.kr/zh-tw/seoul-nightlife",
        "zh-HK": "https://nightflow.kr/zh-tw/seoul-nightlife",
        "ja-JP": "https://nightflow.kr/ja/seoul-nightlife",
        "x-default": "https://nightflow.kr/en/seoul-nightlife",
    },
  },
  openGraph: { title: "首爾夜生活指南 2026 — 去哪裡、訂哪裡", description: "外國旅客的誠實指南。江南、弘大、梨泰院、狎鷗亭。真實價格，無中介。", url: "https://nightflow.kr/zh-tw/seoul-nightlife", locale: "zh_TW", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

export default function ZhTwSeoulNightlifePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: "首爾夜生活指南 2026 — 去哪裡、訂哪裡", description: "外國旅客完整的首爾夜生活指南。", image: ["https://nightflow.kr/og-image.png"], datePublished: "2026-01-01T00:00:00+09:00", author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" }, publisher: { "@type": "Organization", name: "NightFlow", logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" } }, mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/zh-tw/seoul-nightlife" }, inLanguage: "zh-TW" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh-tw" }, { "@type": "ListItem", position: 2, name: "首爾夜生活", item: "https://nightflow.kr/zh-tw/seoul-nightlife" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh-tw" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首爾夜生活指南</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">外國旅客該去哪裡、訂哪裡、如何真正享受首爾夜生活。無中介費，無需韓語。</p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">按地區瀏覽首爾夜生活</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">首爾夜生活不是單一的 — 是四個地區四種不同氛圍、人群和價格的夜生活。</p>
          <div className="space-y-3">
            {[
              { name: "江南", vibe: "高端 EDM、時尚人群、VIP 包廂文化、₩750K+ 包廂", link: "/zh-tw/clubs/gangnam" },
              { name: "弘大", vibe: "嘻哈 & K-POP、外國人友善、可 walk-in、入場費 ₩10–30K", link: "/zh-tw/clubs/hongdae" },
              { name: "梨泰院", vibe: "國際化、英語友善、House 和電子音樂", link: "/zh-tw/clubs/itaewon" },
              { name: "狎鷗亭 & 清潭", vibe: "高端 VIP 包廂、香檳服務、₩2M+ 包廂", link: "/zh-tw/clubs/apgujeong" },
            ].map((d) => (
              <Link key={d.name} href={d.link} className="block p-5 rounded-2xl bg-card border border-border hover:border-border transition-colors">
                <p className="font-bold text-[15px] text-foreground mb-1">{d.name}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{d.vibe}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">首爾夜晚花費</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• Walk-in 普通: 每人 ₩30,000–80,000</li>
            <li>• 弘大 VIP 包廂 (6 人): 每人 ₩50,000–100,000</li>
            <li>• 江南主 VIP (4–6 人): 每人 ₩150,000–300,000</li>
            <li>• 狎鷗亭高端包廂: 每人 ₩400,000+</li>
          </ul>
          <Link href="/zh-tw/vip-tables" className="text-[12px] text-blue-400 hover:underline">完整 VIP 包廂價格 →</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">無需韓語如何預訂</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">選好想去的夜店(或者只告訴我們喜好)，填寫日期、人數和預算。NightFlow 直接聯絡夜店，用中文為您鎖定桌位。到場後直接入場。</p>
          <Link href="/flags/new?lang=zh-tw" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">🍾 透過 NightFlow 預訂</Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">更多指南</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/zh-tw/vip-tables">首爾 VIP 包廂預訂 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/guests">首爾夜店 Guest List →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/kpop-clubs">首爾 K-POP 夜店 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh-tw/faq">首爾夜店 FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
