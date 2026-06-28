import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首尔夜店 Guest List — 韩国夜店免费入场 (无需韩语)",
  },
  description:
    "通过 guest list 免费入场首尔顶级夜店 — 江南、弘大、梨泰院。跳过入场费。每周来自真实夜店 MD 的 guest 优惠。无中介，无需韩语。",
  keywords: [
    "首尔夜店 guest list",
    "首尔夜店免费入场",
    "首尔夜店入场费",
    "韩国夜店 guest list",
    "韩国夜店免费入场",
    "江南夜店 guest list",
    "弘大夜店 guest list",
    "梨泰院夜店 guest list",
    "首尔夜店 MD",
    "韩国夜店推广员",
    "首尔夜店折扣",
  ],
  alternates: { canonical: "https://nightflow.kr/zh/guests" },
  openGraph: {
    title: "首尔夜店 Guest List — 韩国夜店免费入场",
    description: "跳过首尔顶级夜店的入场费。每周 guest 优惠，无需韩语。",
    url: "https://nightflow.kr/zh/guests",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function ZhGuestsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "首尔夜店 Guest List",
        provider: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh" },
        areaServed: { "@type": "City", name: "首尔" },
        description: "来自真实首尔夜店 MD 的每周 guest list 优惠。江南、弘大、梨泰院夜店免费或折扣入场。中文友好。",
        serviceType: "Club Guest List",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh" },
          { "@type": "ListItem", position: 2, name: "Guest List", item: "https://nightflow.kr/zh/guests" },
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
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">首尔夜店 Guest List</h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            跳过首尔顶级夜店的入场费。来自真实 MD 的每周 guest 优惠 — 免费入场、折扣入场、免费饮品券。无需韩语，无中介。
          </p>
        </header>
        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">什么是首尔夜店 Guest List？</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            韩国夜店 MD（推广员）运营每周 guest list — 通常在特定时间前免费或折扣入场。本地人用这种方式避开 ₩20,000–30,000 入场费。难点：传统上需要通过 Instagram 或 KakaoTalk 联系韩国 MD。
          </p>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            NightFlow 将江南、弘大、梨泰院夜店每周的 guest 优惠汇集一处 — 中文界面，一键复制粘贴消息发给各 MD。
          </p>
        </section>
        <section className="space-y-4">
          <h2 className="text-[20px] font-black">您可获得什么</h2>
          <ul className="space-y-2 text-[13px] text-neutral-300">
            <li>• 特定时间前免费入场（通常到午夜 12 点）</li>
            <li>• 免费时段后入场费折扣</li>
            <li>• 部分夜店免费饮品券</li>
            <li>• 优先入场（跳过常规队列）</li>
            <li>• 每周更新 — 每周一上新</li>
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-[20px] font-black">如何使用首尔 Guest List</h2>
          <ol className="space-y-2 text-[13px] text-neutral-300 list-decimal pl-5">
            <li>在 NightFlow 浏览每周 guest 优惠</li>
            <li>挑选夜店 — 江南、弘大或梨泰院</li>
            <li>点击"复制消息" — 预写好的中文/英文请求</li>
            <li>粘贴到 MD 的 Instagram DM</li>
            <li>获得确认 — 您的名字上 list</li>
            <li>到夜店，直接入场</li>
          </ol>
        </section>
        <section className="text-center pt-4 space-y-3">
          <Link href="/zh/clubs" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors">
            查看本周 guest 优惠 →
          </Link>
          <Link href="/zh/faq" className="text-[12px] text-blue-400 hover:underline">查看 FAQ →</Link>
        </section>
      </div>
    </div>
  );
}
