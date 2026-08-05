import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首尔夜店预订 FAQ — 韩国夜生活常见问题 (中国游客)",
  },
  description:
    "首尔夜店预订常见问题，专为中国游客整理。韩国价格、VIP 包间、着装要求、中介陷阱 — 中文解答。",
  keywords: [
    "首尔夜店 FAQ",
    "韩国夜生活问答",
    "首尔夜店预订 FAQ",
    "江南夜店 FAQ",
    "弘大夜店问答",
    "韩国夜店指南",
    "外国人首尔夜生活",
    "韩国夜店中介",
    "首尔包间价格",
    "韩国VIP包间",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh/faq",
    languages: {
        "ko-KR": "https://nightflow.kr/faq",
        "en-US": "https://nightflow.kr/en/faq",
        "zh-CN": "https://nightflow.kr/zh/faq",
        "zh-TW": "https://nightflow.kr/zh/faq",
        "ja-JP": "https://nightflow.kr/ja/faq",
        "x-default": "https://nightflow.kr/faq",
    },
  },
  openGraph: {
    title: "首尔夜店预订 FAQ — 韩国夜生活常见问题",
    description: "韩国夜店真实价格、着装要求、外国人如何预订 VIP 包间。",
    url: "https://nightflow.kr/zh/faq",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const FAQS = [
  {
    q: "我不会韩语，能预订首尔夜店吗？",
    a: "可以。NightFlow 让外国游客全程用中文/英文预订首尔夜店。您选好想去的夜店（或者只告诉我们预算和喜好），我们会直接联系夜店为您锁定座位 — 无需韩语，无中介。",
  },
  {
    q: "外国人在首尔夜店一晚要花多少钱？",
    a: "普通入场每人 ₩20,000–30,000。江南主桌 VIP 包间起价 ₩750,000（4–6 人均摊每人 ₩150–300K）。狎鸥亭高端包间起价 ₩2,000,000。通过 NightFlow 预订，您支付的是韩国本地价 — 无游客加价。",
  },
  {
    q: "首尔哪个区最适合外国人？",
    a: "梨泰院最外国人友好，员工会说英语，国际化人群。弘大最适合 K-POP 和嘻哈粉丝，walk-in 友好。江南适合奢华 VIP 体验。狎鸥亭适合高端香槟包间。",
  },
  {
    q: "应该提前多久预订首尔夜店？",
    a: "最佳：出行前 3–7 天。可接受：24 小时前。最后底线：当天 — 我们仍会尝试，但可预订的夜店会较少。周五/周六是高峰之夜，最先约满。",
  },
  {
    q: "需要押金或预订费吗？",
    a: "无预订费，无押金。在 NightFlow 提交请求免费。您只在到场后直接付款给夜店 — 韩国本地价，无中介加价。",
  },
  {
    q: "没有韩国 MD 关系也能预订 VIP 包间吗？",
    a: "可以。传统首尔夜店预订需要韩国 MD（推广员）联系人。NightFlow 帮您解决这一切 — 我们直接联系夜店，为您锁定预算内最好的桌位。无需关系，无语言障碍。",
  },
  {
    q: "首尔夜店的着装要求是什么？",
    a: "江南：smart casual 起步 — 不可穿人字拖、短裤、破洞牛仔裤。弘大：随意，街头风可以。梨泰院：国际化 smart casual。务必携带实体护照（韩国法律要求 ID 入场）。",
  },
  {
    q: "首尔夜店接受外国人吗？",
    a: "大多数接受。弘大和梨泰院夜店欢迎外国人 — 许多场所积极接待国际游客。部分江南夜店根据外貌和韩语能力有严格门控，但预订 VIP 包间的客人几乎不会被拒。",
  },
  {
    q: "6 人以上的团体可以预订吗？",
    a: "可以。4–6 人最适合 VIP 包间（人均成本最优）。6 人以上可能需要预订相邻多桌。NightFlow 让您在提交请求时指定团体人数，我们会相应为您匹配。",
  },
  {
    q: "不订 VIP 包间，能跳过排队吗？",
    a: "许多夜店提供 guest list（게스트）选项 — 提前到场可享免费或折扣入场。NightFlow 的'Guest Sign'功能展示每周韩国夜店的 guest list 优惠。每周一晚 18:00 KST 更新。",
  },
  {
    q: "首尔有哪些音乐风格的夜店？",
    a: "嘻哈：Club Dokkaebi (弘大)、Club Arzu (清潭)、DM Seoul (狎鸥亭)。EDM：Club ACE (江南)、Core Lounge (狎鸥亭)、Bermuda (弘大)。House/Techno：Soap Seoul (梨泰院)、Faust (梨泰院)、Vurt (梨泰院)。K-POP：NB2 (弘大)。",
  },
  {
    q: "可以与陌生人拼桌降低成本吗？",
    a: "可以 — NightFlow 上称为'Share'（파티）。MD 出售高级桌的单个座位，您只需支付桌价的 1/N。单人游客或情侣想要 VIP 体验但又不想全包时非常合适。",
  },
];

export default function ZhFaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://nightflow.kr/zh/faq" },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            首尔夜店预订 FAQ
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            关于首尔夜生活的真实解答，专为中国游客整理。价格、着装、VIP 包间、中介问题 — 您第一次在首尔玩之前应该知道的一切。
          </p>
        </header>

        <section className="space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl bg-card border border-border overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                <span className="font-bold text-[15px] text-foreground leading-snug">
                  {f.q}
                </span>
                <span className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0">
                  ▾
                </span>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-[13px] text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            </details>
          ))}
        </section>

        <section className="space-y-3 pt-4 text-center">
          <Link
            href="/zh"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 通过 NightFlow 预订
          </Link>
          <p className="text-[12px] text-muted-foreground">
            19+ · 携带护照 · 无预订费
          </p>
        </section>
      </div>
    </div>
  );
}
