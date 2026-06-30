import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "Seoul Club Guest List — Free Entry to Korean Clubs (No Korean Needed)",
  },
  description:
    "Get free entry to Seoul's top clubs in Gangnam, Hongdae, Itaewon via guest list. Skip the cover charge. Weekly guest deals from real club MDs. No broker, no Korean required.",
  keywords: [
    // Guest list 영어
    "Seoul club guest list",
    "Seoul club free entry",
    "Seoul nightclub guest list",
    "Seoul club cover charge",
    "Korea club guest list",
    "Korean club guest list",
    "Korea club free entry",
    "Korean nightlife guest",
    // 동네 + guest
    "Gangnam club guest list",
    "Hongdae club guest list",
    "Itaewon club guest list",
    "Gangnam free entry",
    "Hongdae free entry",
    // 일반
    "Seoul club MD",
    "Korea club promoter",
    "Seoul club discount",
    "Seoul nightclub free",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/guests",
    languages: {
        "en-US": "https://nightflow.kr/en/guests",
        "zh-CN": "https://nightflow.kr/zh/guests",
        "zh-TW": "https://nightflow.kr/zh/guests",
        "ja-JP": "https://nightflow.kr/ja/guests",
        "x-default": "https://nightflow.kr/en/guests",
    },
  },
  openGraph: {
    title: "Seoul Club Guest List — Free Entry to Korean Clubs",
    description:
      "Skip the cover charge at Seoul's top clubs. Weekly guest deals, no Korean needed.",
    url: "https://nightflow.kr/en/guests",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://nightflow.kr/api/og?title=Seoul+Club+Guest+List&sub=Free+Entry+to+Korean+Clubs+%E2%80%94+Weekly+Deals&lang=en", width: 1200, height: 630 }],
  },
};

export default function EnGuestsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/en/guests/#service",
        name: "Seoul Club Guest List",
        provider: {
          "@type": "Organization",
          name: "NightFlow",
          url: "https://nightflow.kr/en",
        },
        areaServed: { "@type": "City", name: "Seoul" },
        description:
          "Weekly guest list deals from real Seoul club MDs. Free entry or discounted cover at Gangnam, Hongdae, Itaewon clubs. English-friendly.",
        serviceType: "Club Guest List",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
          { "@type": "ListItem", position: 2, name: "Guest List", item: "https://nightflow.kr/en/guests" },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-neutral-500 hover:text-white">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            Seoul Club Guest List
          </h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Skip the cover charge at Seoul&apos;s top clubs. Weekly guest deals
            from real club MDs — free entry, discounted covers, free drink
            tickets. No Korean needed, no broker.
          </p>
        </header>

        <section className="space-y-3 text-center">
          <h2 className="text-[20px] font-black">What is a Seoul Club Guest List?</h2>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            Korean club MDs (promoters) run weekly guest lists — usually free
            entry or discounted cover until a specific time. Locals use these
            to avoid the ₩20,000–30,000 cover charge. The catch: you traditionally
            need a Korean MD contact via Instagram or KakaoTalk.
          </p>
          <p className="text-[13px] text-neutral-400 leading-relaxed">
            NightFlow shows you the weekly guest deals across Gangnam, Hongdae,
            Itaewon clubs in one place — in English, with one-tap copy-paste
            messages to each MD.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black">What You Get</h2>
          <ul className="space-y-2 text-[13px] text-neutral-300">
            <li>• Free entry before specific time (usually until 12 AM)</li>
            <li>• Discounted cover charge after the free window</li>
            <li>• Free drink ticket at some clubs</li>
            <li>• Priority entry (skip the regular line)</li>
            <li>• Weekly updates — fresh deals every Monday</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black">How to Use Seoul Guest List</h2>
          <ol className="space-y-2 text-[13px] text-neutral-300 list-decimal pl-5">
            <li>Browse weekly guest deals on NightFlow</li>
            <li>Pick a club — Gangnam, Hongdae, or Itaewon</li>
            <li>Tap &quot;Copy Message&quot; — pre-written English request</li>
            <li>Paste into the MD&apos;s Instagram DM</li>
            <li>Get confirmation — your name on the list</li>
            <li>Show up at the club, walk in</li>
          </ol>
        </section>

        <section className="text-center pt-4 space-y-3">
          <Link
            href="/en/clubs"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors"
          >
            See this week&apos;s guest deals →
          </Link>
          <Link href="/en/faq" className="text-[12px] text-blue-400 hover:underline">
            See FAQ for more →
          </Link>
        </section>
      </div>
    </div>
  );
}
