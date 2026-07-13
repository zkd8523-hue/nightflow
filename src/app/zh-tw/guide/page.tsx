import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
  },
  description:
    "無需韓語預訂首爾頂級夜店。江南、弘大、梨泰院、狎鷗亭最佳 VIP 包廂。公平價格,跳過排隊和中介。台港遊客韓國夜生活指南。",
  keywords: [
    "韓國夜店預訂指南",
    "韓國夜生活指南",
    "韓國VIP包廂",
    "韓國夜店指南",
    "首爾夜店預訂指南",
    "首爾VIP包廂預訂",
    "首爾派對預訂",
    "首爾夜店指南",
    "弘大夜店預訂",
    "弘大VIP包廂",
    "弘大夜店指南",
    "江南夜店預訂",
    "江南VIP包廂",
    "江南夜店指南",
    "梨泰院夜店預訂",
    "梨泰院夜生活指南",
    "狎鷗亭包廂預訂",
    "清潭包廂",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/guide",
    languages: {
        "en-US": "https://nightflow.kr/en/guide",
        "zh-CN": "https://nightflow.kr/zh/guide",
        "zh-TW": "https://nightflow.kr/zh-tw/guide",
        "zh-Hant": "https://nightflow.kr/zh-tw/guide",
        "zh-HK": "https://nightflow.kr/zh-tw/guide",
        "ja-JP": "https://nightflow.kr/ja/guide",
        "x-default": "https://nightflow.kr/en/guide",
    },
  },
  openGraph: {
    title: "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
    description: "無需韓語預訂首爾頂級夜店。真實價格,無中介。",
    url: "https://nightflow.kr/zh-tw/guide",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function ZhTwGuidePage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
    description:
      "無需韓語預訂首爾最熱夜店。江南、弘大、梨泰院、狎鷗亭最佳 VIP 包廂。公平價格,跳過排隊和中介。",
    image: ["https://nightflow.kr/og-image.png"],
    datePublished: "2026-01-01T00:00:00+09:00",
    dateModified: new Date().toISOString().split("T")[0] + "T00:00:00+09:00",
    author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" },
    publisher: {
      "@type": "Organization",
      name: "NightFlow",
      logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/zh-tw/guide" },
    inLanguage: "zh-TW",
    about: [
      { "@type": "Thing", name: "首爾夜生活" },
      { "@type": "Thing", name: "韓國夜店預訂" },
      { "@type": "Thing", name: "江南VIP包廂" },
      { "@type": "Thing", name: "弘大夜店" },
      { "@type": "Thing", name: "梨泰院夜生活" },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP (首爾)</h1>
        <p>
          在尋找真正適合台港遊客的首爾夜店預訂方式?NightFlow 是專為外國遊客打造的韓國夜店預訂平台 — 江南 VIP 包廂預訂、弘大夜店預訂、梨泰院國際化夜生活。真實價格,無中介,無需韓語。像本地人一樣預訂首爾夜店。
        </p>
        <h2>透過 NightFlow 預訂韓國夜店的流程</h2>
        <p>
          選好想去的夜店(或者只告訴我們您的預算和喜好) — 加上日期、人數、預算。NightFlow 會直接聯絡夜店,為您鎖定預算內最好的桌位,通常數小時內就有回覆。到場後直接付款給夜店。零預訂費,無中介加價,無押金。
        </p>
        <h2>為什麼在這裡預訂韓國夜店而不是 walk-in</h2>
        <p>
          在首爾 walk-in 預訂意味著遊客價格和最差座位。NightFlow 以在地價格為您代訂 — 我們直接聯絡夜店,無中介加價。真正的本地人這樣預訂,現在您也可以。
        </p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <Link href="/zh-tw" className="text-2xl font-black tracking-tight text-white">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            在首爾最佳夜店
            <br />
            做 VIP
          </h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">
            韓國夜店預訂輕鬆簡單。無關係,無韓語,無中介。NightFlow 讓您在江南、弘大、梨泰院夜店獲得最佳座位 — 公平、透明的價格。從第一晚就像本地人一樣預訂。
          </p>
        </header>
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">受夠了遊客待遇?</h2>
          <div className="space-y-4">
            {[
              { icon: "🤷", title: "不知道哪家夜店好", body: "您不了解本地圈子。評論全是韓語。最後被拉客的人帶去隨便哪家。" },
              { icon: "💸", title: "遊客價格", body: "Walk-in 還是中介,您都不知道是否被宰。無法比較,無法砍價。" },
              { icon: "🧍", title: "在外排隊", body: "無關係,無包廂,無 guest list。您在冷風中等待,本地人卻直接進入。" },
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
          <Link href="/zh-tw/clubs" className="block text-center text-[13px] text-blue-400 underline">
            瀏覽首爾夜店真實價格 →
          </Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-neutral-500 uppercase text-center">
            首爾夜店預訂流程
          </h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "選擇您的夜店", body: "選好想去的夜店(或者只告訴我們您的喜好) — 日期、預算、人數。" },
              { n: "2", title: "我們直接為您預訂", body: "NightFlow 直接聯絡夜店,為您鎖定預算內最好的桌位 — 真實價格,無中介加價。" },
              { n: "3", title: "像 VIP 一樣入場", body: "最佳包廂已預訂,無排隊,無中介。在 Instagram 聯絡夜店,到門口出示護照 (19+)。" },
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
          <Link href="/zh-tw" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors">
            獲取 VIP 通道 — 免費註冊
          </Link>
          <p className="text-[12px] text-neutral-600 text-center leading-relaxed">
            19+ · 攜帶護照到場
            <br />
            讓夜晚更美好
          </p>
        </section>
      </div>
    </div>
  );
}
