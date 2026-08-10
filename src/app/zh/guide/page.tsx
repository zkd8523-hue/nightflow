import type { Metadata } from "next";
import Link from "next/link";
import { krwToAll } from "@/lib/utils/currency";

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
  alternates: {
    canonical: "https://nightflow.kr/zh/guide",
    languages: {
        "en-US": "https://nightflow.kr/en/guide",
        "zh-CN": "https://nightflow.kr/zh/guide",
        "zh-TW": "https://nightflow.kr/zh/guide",
        "ja-JP": "https://nightflow.kr/ja/guide",
        "x-default": "https://nightflow.kr/en/guide",
    },
  },
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
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韩国夜店预订指南 — 在江南、弘大、梨泰院做 VIP (首尔)</h1>
        <p>
          在寻找真正适合中国游客的首尔夜店预订方式？NightFlow 是专为外国游客打造的韩国夜店预订平台 — 江南 VIP 包间预订、弘大夜店预订、梨泰院国际化夜生活。真实价格，无中介，无需韩语。像本地人一样预订首尔夜店。
        </p>
        <h2>通过 NightFlow 预订韩国夜店的流程</h2>
        <p>
          选好想去的夜店（或者只告诉我们您的预算和喜好）— 加上日期、人数、预算。NightFlow 会直接联系夜店，为您锁定预算内最好的桌位，通常几小时内就有回复。到场后直接付款给夜店。零预订费，无中介加价，无押金。
        </p>
        <h2>为什么在这里预订韩国夜店而不是 walk-in</h2>
        <p>
          在首尔 walk-in 预订意味着游客价格和最差座位。NightFlow 以本地价格为您代订 — 我们直接联系夜店，无中介加价。真正的本地人这样预订，现在您也可以。
        </p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <Link href="/zh" className="text-2xl font-black tracking-tight text-foreground">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            在首尔最佳夜店
            <br />
            做 VIP
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
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
              <div key={p.title} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{p.icon}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-foreground">{p.title}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/zh/clubs" className="block text-center text-[13px] text-blue-400 underline">
            浏览首尔夜店真实价格 →
          </Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-muted-foreground uppercase text-center">
            首尔夜店预订流程
          </h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "选择您的夜店", body: "选好想去的夜店（或者只告诉我们您的喜好）— 日期、预算、人数。" },
              { n: "2", title: "我们直接为您预订", body: "NightFlow 直接联系夜店，为您锁定预算内最好的桌位 — 真实价格，无中介加价。" },
              { n: "3", title: "像 VIP 一样入场", body: "最佳包间已预订，无排队，无中介。在 Instagram 联系夜店，到门口出示护照 (19+)。" },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 w-9 h-9 rounded-full bg-inverse text-inverse-foreground font-black flex items-center justify-center">{s.n}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Price tiers */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black tracking-tight">想要完整的 VIP 之夜吗？</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              带上朋友，消费 ₩500,000+，留下旅途中最美好的回忆。这是首尔一晚真实的花费 — 不用再猜了。
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: "🎟️", label: "普通入场", price: "₩20,000–30,000/人", krwAmount: 25000, desc: "入场费 + 第一杯酒。舞池里畅快的一晚。" },
              { icon: "👑", label: "全套 VIP", price: "₩500,000+", krwAmount: 500000, desc: "最佳座位、酒水服务、专属服务员全程照顾 — 让您毕生难忘的一晚。" },
            ].map((t) => (
              <div key={t.label} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{t.icon}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-[15px] text-foreground">{t.label}</p>
                    <p className="font-black text-[14px] text-brand-amber whitespace-nowrap">{t.price}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">≈ {krwToAll(t.krwAmount)}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            设定您的预算 — 我们会为您匹配最好的桌位。带的人越多，夜晚就越 VIP。
          </p>
          <Link href="/flags/new?lang=zh" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">
            通过 NightFlow 预订
          </Link>
        </section>

        {/* Safety tips */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black tracking-tight text-center">出发前须知</h2>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            首尔夜生活精彩纷呈 — 但游客确实会被骗。以下是如何保护自己的方法。
          </p>
          <div className="space-y-3">
            {[
              {
                q: "🚩 常见骗局要当心",
                items: [
                  "“免费入场”陷阱 — 先免费引你进去，不交高额酒水费或入场费就不让走。",
                  "隐藏价格 — 没有官方菜单；外国人被收取数倍于实际价格的桌位费和酒水费。",
                  "盗刷银行卡 — 趁客人喝醉，拿走信用卡在未经同意的情况下反复扣款。",
                  "假冒中介 — 私信兜售“预订”，从中赚取远超真实价格的差价。",
                ],
              },
              {
                q: "🛡️ 如何保护自己",
                items: [
                  "不要跟着在弘大或梨泰院街头发放“免费入场”卡的拉客者走。",
                  "务必查看印刷的价格菜单。每单先付款。",
                  "核对收据，并在手机上开启银行卡支付即时提醒。",
                  "只通过官方渠道预订 — 夜店官方账号，绝不通过未经验证的中介。",
                ],
              },
              {
                q: "📞 万一出事怎么办",
                items: [
                  "报警 — 112。遇到人身危险、被限制人身自由或被强迫付款时拨打。",
                  "旅游投诉中心 — 1330。由韩国观光公社运营，提供外语帮助和超额收费调解。",
                ],
              },
            ].map((t) => (
              <details key={t.q} className="group rounded-2xl bg-card border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                  <span className="font-bold text-[15px] text-foreground">{t.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="px-5 pb-5 space-y-2">
                  {t.items.map((it, i) => (
                    <p key={i} className="text-[13px] text-muted-foreground leading-relaxed">• {it}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            或者直接跳过这些风险 — NightFlow 是经过验证的正规渠道。真实夜店，透明价格，没有拉客者。
          </p>
        </section>

        <section className="space-y-3 pt-2">
          <Link href="/flags/new?lang=zh" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">
            获取 VIP 通道 — 无需注册
          </Link>
          <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
            19+ · 携带护照到场
            <br />
            让夜晚更美好
          </p>
        </section>
      </div>
    </div>
  );
}
