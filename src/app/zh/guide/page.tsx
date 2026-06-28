import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "韩国夜店预订指南 — 在江南、弘大、梨泰院做 VIP",
  },
  description:
    "无需韩语预订首尔顶级夜店。江南、弘大、梨泰院、狎鸥亭最佳 VIP 包间。公平价格，跳过排队和中介。中国游客韩国夜生活指南。",
  keywords: [
    "韩国夜店预订指南",
    "韩国夜生活指南",
    "韩国VIP包间",
    "韩国夜店指南",
    "首尔夜店预订指南",
    "首尔VIP包间预订",
    "首尔派对预订",
    "首尔夜店指南",
    "弘大夜店预订",
    "弘大VIP包间",
    "弘大夜店指南",
    "江南夜店预订",
    "江南VIP包间",
    "江南夜店指南",
    "梨泰院夜店预订",
    "梨泰院夜生活指南",
    "狎鸥亭包间预订",
    "清潭包间",
  ],
  alternates: { canonical: "https://nightflow.kr/zh/guide" },
  openGraph: {
    title: "韩国夜店预订指南 — 在江南、弘大、梨泰院做 VIP",
    description: "无需韩语预订首尔顶级夜店。真实价格，无中介。",
    url: "https://nightflow.kr/zh/guide",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function ZhGuidePage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "韩国夜店预订指南 — 在江南、弘大、梨泰院做 VIP",
    description:
      "无需韩语预订首尔最热夜店。江南、弘大、梨泰院、狎鸥亭最佳 VIP 包间。公平价格，跳过排队和中介。",
    image: ["https://nightflow.kr/og-image.png"],
    datePublished: "2026-01-01T00:00:00+09:00",
    dateModified: new Date().toISOString().split("T")[0] + "T00:00:00+09:00",
    author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh" },
    publisher: {
      "@type": "Organization",
      name: "NightFlow",
      logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/zh/guide" },
    inLanguage: "zh-CN",
    about: [
      { "@type": "Thing", name: "首尔夜生活" },
      { "@type": "Thing", name: "韩国夜店预订" },
      { "@type": "Thing", name: "江南VIP包间" },
      { "@type": "Thing", name: "弘大夜店" },
      { "@type": "Thing", name: "梨泰院夜生活" },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韩国夜店预订指南 — 在江南、弘大、梨泰院做 VIP (首尔)</h1>
        <p>
          在寻找真正适合中国游客的首尔夜店预订方式？NightFlow 是专为外国游客打造的韩国夜店预订平台 — 江南 VIP 包间预订、弘大夜店预订、梨泰院国际化夜生活。真实价格，无中介，无需韩语。像本地人一样预订首尔夜店。
        </p>
        <h2>通过 NightFlow 预订韩国夜店的流程</h2>
        <p>
          告诉我们您的夜晚 — 日期、人数、预算。首尔夜店预订报价数小时内到达。在一个界面比较江南、弘大、梨泰院夜店报价。挑选并到场后直接付款。零预订费，无中介加价，无押金。
        </p>
        <h2>为什么在这里预订韩国夜店而不是 walk-in</h2>
        <p>
          在首尔 walk-in 预订意味着游客价格和最差座位。NightFlow 首尔夜店预订颠覆了这一切 — 顶级夜店主动竞争您的预订，发送只有您能看到的专属 VIP 报价。真正的本地人这样预订，现在您也可以。
        </p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <Link href="/zh" className="text-2xl font-black tracking-tight text-white">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            在首尔最佳夜店
            <br />
            做 VIP
          </h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">
            韩国夜店预订轻松简单。无关系，无韩语，无中介。NightFlow 让您在江南、弘大、梨泰院夜店获得最佳座位 — 公平、透明的价格。从第一晚就像本地人一样预订。
          </p>
        </header>
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">受够了游客待遇？</h2>
          <div className="space-y-4">
            {[
              { icon: "🤷", title: "不知道哪家夜店好", body: "您不了解本地圈子。评论全是韩语。最后被拉客的人带去随便哪家。" },
              { icon: "💸", title: "游客价格", body: "Walk-in 还是中介，您都不知道是否被宰。无法比较，无法砍价。" },
              { icon: "🧍", title: "在外排队", body: "无关系，无包间，无 guest list。您在冷风中等待，本地人却直接进入。" },
            ].map((p) => (
              <div key={p.title} className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{p.icon}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-neutral-200">{p.title}</p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/zh/clubs" className="block text-center text-[13px] text-blue-400 underline">
            浏览首尔夜店真实价格 →
          </Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-neutral-500 uppercase text-center">
            首尔夜店预订流程
          </h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "告诉我们您的夜晚", body: "日期、预算、人数。不需要知道任何夜店名字。" },
              { n: "2", title: "顶级夜店竞争您的预订", body: "首尔最好的夜店发送专属 VIP 报价 — 真实包间，真实价格。他们竞争，您挑选。" },
              { n: "3", title: "像 VIP 一样入场", body: "最佳包间已预订，无排队，无中介。在 Instagram 联系夜店，到门口出示护照 (19+)。" },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
                <div className="shrink-0 w-9 h-9 rounded-full bg-white text-black font-black flex items-center justify-center">{s.n}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 pt-2">
          <Link href="/zh" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors">
            获取 VIP 通道 — 免费注册
          </Link>
          <p className="text-[12px] text-neutral-600 text-center leading-relaxed">
            19+ · 携带护照到场
            <br />
            让夜晚更美好
          </p>
        </section>
      </div>
    </div>
  );
}
