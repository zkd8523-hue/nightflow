import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "首尔夜生活指南 2026 — 去哪里、订哪里 (外国游客版)" },
  description: "完整的首尔夜生活指南，专为外国游客打造。江南 EDM、弘大嘻哈、梨泰院国际化、狎鸥亭 VIP 包间。真实价格，无中介，无需韩语。",
  keywords: ["首尔夜生活","首尔夜生活指南","韩国夜生活","韩国夜生活指南","首尔夜场","首尔派对","首尔夜店","首尔最好的夜生活","首尔夜生活技巧","首尔夜生活区","江南夜生活","弘大夜生活","梨泰院夜生活","狎鸥亭夜生活","首尔酒吧和夜店","韩国旅游夜生活"],
  alternates: {
    canonical: "https://nightflow.kr/zh/seoul-nightlife",
    languages: {
        "en-US": "https://nightflow.kr/en/seoul-nightlife",
        "zh-CN": "https://nightflow.kr/zh/seoul-nightlife",
        "zh-TW": "https://nightflow.kr/zh/seoul-nightlife",
        "ja-JP": "https://nightflow.kr/ja/seoul-nightlife",
        "x-default": "https://nightflow.kr/en/seoul-nightlife",
    },
  },
  openGraph: { title: "首尔夜生活指南 2026 — 去哪里、订哪里", description: "外国游客的诚实指南。江南、弘大、梨泰院、狎鸥亭。真实价格，无中介。", url: "https://nightflow.kr/zh/seoul-nightlife", locale: "zh_CN", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

export default function ZhSeoulNightlifePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: "首尔夜生活指南 2026 — 去哪里、订哪里", description: "外国游客完整的首尔夜生活指南。", image: ["https://nightflow.kr/og-image.png"], datePublished: "2026-01-01T00:00:00+09:00", author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh" }, publisher: { "@type": "Organization", name: "NightFlow", logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" } }, mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/zh/seoul-nightlife" }, inLanguage: "zh-CN" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" }, { "@type": "ListItem", position: 2, name: "首尔夜生活", item: "https://nightflow.kr/zh/seoul-nightlife" }] },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首尔夜生活指南</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">外国游客该去哪里、订哪里、如何真正享受首尔夜生活。无中介费，无需韩语。</p>
        </header>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">按地区浏览首尔夜生活</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">首尔夜生活不是单一的 — 是四个地区四种不同氛围、人群和价格的夜生活。</p>
          <div className="space-y-3">
            {[
              { name: "江南", vibe: "高端 EDM、时尚人群、VIP 包间文化、₩750K+ 包间", link: "/zh/clubs/gangnam" },
              { name: "弘大", vibe: "嘻哈 & K-POP、外国人友好、可 walk-in、入场费 ₩10–30K", link: "/zh/clubs/hongdae" },
              { name: "梨泰院", vibe: "国际化、英语友好、House 和电子音乐", link: "/zh/clubs/itaewon" },
              { name: "狎鸥亭 & 清潭", vibe: "高端 VIP 包间、香槟服务、₩2M+ 包间", link: "/zh/clubs/apgujeong" },
            ].map((d) => (
              <Link key={d.name} href={d.link} className="block p-5 rounded-2xl bg-card border border-border hover:border-border transition-colors">
                <p className="font-bold text-[15px] text-foreground mb-1">{d.name}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{d.vibe}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">首尔夜晚费用</h2>
          <ul className="space-y-2 text-[13px] text-foreground/80">
            <li>• Walk-in 普通: 每人 ₩30,000–80,000</li>
            <li>• 弘大 VIP 包间 (6 人): 每人 ₩50,000–100,000</li>
            <li>• 江南主 VIP (4–6 人): 每人 ₩150,000–300,000</li>
            <li>• 狎鸥亭高端包间: 每人 ₩400,000+</li>
          </ul>
          <Link href="/zh/vip-tables" className="text-[12px] text-blue-400 hover:underline">完整 VIP 包间价格 →</Link>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">无需韩语如何预订</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">选好想去的夜店(或者只告诉我们预算和喜好)，填写日期、人数和预算。NightFlow 会直接联系夜店，为您锁定预算内最好的桌位 — 中文沟通，真实价格。到场后直接付款给夜店。</p>
          <Link href="/zh" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">🍾 通过 NightFlow 预订</Link>
        </section>
        <section className="space-y-2 pt-4">
          <h2 className="text-[20px] font-black">更多指南</h2>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/zh/vip-tables">首尔 VIP 包间预订 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/guests">首尔夜店 Guest List →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/kpop-clubs">首尔 K-POP 夜店 →</Link></li>
            <li><Link className="hover:text-foreground" href="/zh/faq">首尔夜店 FAQ →</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
