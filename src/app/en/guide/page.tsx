import Link from "next/link";
import type { Metadata } from "next";
import { krwToAll } from "@/lib/utils/currency";

export const metadata: Metadata = {
  // absolute = root layout의 "%s | 나플" template 무시 (한글 노출 차단)
  title: {
    absolute:
      "Korea Club Booking Guide — Be a VIP at Gangnam, Hongdae, Itaewon Clubs",
  },
  description:
    "Book Korea's hottest clubs in Seoul without speaking Korean. Best VIP tables in Gangnam, Hongdae, Itaewon, Apgujeong. Fair prices, skip the line and the broker. Korea nightlife guide for travelers.",
  keywords: [
    // Country-level
    "Korea club booking",
    "Korea nightlife guide",
    "Korea VIP table",
    "Korea club guide",
    "South Korea nightlife",
    // "Korean" 형용사 패턴 (검색량 ↑)
    "Korean club booking",
    "Korean nightlife guide",
    "Korean nightclub guide",
    "Korean bar guide",
    "Korean club",
    "Korean VIP table",
    "K-pop club",
    // Seoul-level
    "Seoul club booking guide",
    "Seoul VIP table booking",
    "book Seoul club",
    "Seoul party booking",
    "Seoul club guide",
    // Hongdae
    "Hongdae club booking",
    "Hongdae VIP table",
    "Hongdae nightclub guide",
    // Gangnam
    "Gangnam club booking",
    "Gangnam VIP table",
    "Gangnam nightclub guide",
    // Itaewon
    "Itaewon club booking",
    "Itaewon nightlife guide",
    // Apgujeong
    "Apgujeong lounge booking",
    "Cheongdam lounge",
    // 추천
    "best Korea clubs",
    "best Seoul clubs",
    "Korea club recommendation",
    "Seoul club recommendation",
    "top clubs Seoul",
    // 지방
    "Busan club booking",
    "Busan nightlife guide",
    "Daegu club",
    "Gwangju club",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/guide",
  },
  openGraph: {
    title: "Seoul Club Booking Guide — Be a VIP at Seoul's Best Clubs",
    description:
      "Book Seoul's hottest clubs without speaking Korean. Best tables, fair prices, no broker.",
    url: "https://nightflow.kr/en/guide",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

// 외국인이 한국 클럽에서 겪는 진짜 고통 = "관광객 취급" (VIP의 반대)
const PAINS = [
  {
    icon: "🤷",
    title: "No idea which club is good",
    body: "You don't speak the scene. Reviews are in Korean. You end up wherever the touts pull you in.",
  },
  {
    icon: "💸",
    title: "Tourist prices",
    body: "Walk-in or broker, you never know if you're overpaying. No way to compare, no way to haggle.",
  },
  {
    icon: "🧍",
    title: "Stuck in line, outside",
    body: "No connections, no table, no guest list. You wait in the cold while regulars walk right in.",
  },
];

// VIP 3단계
const STEPS = [
  {
    n: "1",
    title: "Tell us your night",
    body: "Date, budget, how many of you. That's it — no need to know a single club name.",
  },
  {
    n: "2",
    title: "Top clubs compete for you",
    body: "Seoul's best clubs send you private VIP offers — real tables at real prices. They compete; you pick.",
  },
  {
    n: "3",
    title: "Walk in like a VIP",
    body: "Best table booked, no line, no broker. Message the club on Instagram and show your passport at the door (19+).",
  },
];

// 외국인 방문 안전 팁 (아코디언) — 출처: 국내 바가지 피해 사례 보도
const TIPS = [
  {
    q: "🚩 Common scams to watch for",
    items: [
      "\"Free entry\" traps — lured in for free, then blocked from leaving until you pay huge drink or cover fees.",
      "Hidden prices — no official menu; foreigners charged several times the real price for tables and drinks.",
      "Card abuse — a drunk customer's card taken and charged again and again without consent.",
      "Fake promoters — DMs offering \"reservations,\" then pocketing far more than the real price.",
    ],
  },
  {
    q: "🛡️ How to protect yourself",
    items: [
      "Don't follow street touts handing out \"free entry\" cards in Hongdae or Itaewon.",
      "Always check a printed price menu. Pay upfront, per order.",
      "Check your receipt, and turn on instant card-payment alerts on your phone.",
      "Book through official channels only — the club's official account, never an unverified promoter.",
    ],
  },
  {
    q: "📞 If something goes wrong",
    items: [
      "Police — 112. For immediate danger, confinement, or being forced to pay.",
      "Tourist Complaint Center — 1330. Run by the Korea Tourism Organization: foreign-language help and overcharge mediation.",
    ],
  },
];

// 예산 티어 — 진짜 가격을 알려주고 깃발 예산 감을 잡게 함
const PRICE_TIERS = [
  {
    icon: "🎟️",
    label: "Just get in",
    price: "₩20,000–30,000 pp",
    krwAmount: 25000,
    desc: "Entry + your first drink. A quick night on the dance floor.",
  },
  {
    icon: "👑",
    label: "The full VIP",
    price: "₩500,000+",
    krwAmount: 500000,
    desc: "Prime table, bottle service, staff looking after you all night — the night you'll never forget.",
  },
];

export default function EnglishLanding() {
  // Schema.org Article — Google Top Stories 노출 후보.
  // FAQPage와 함께 = 검색 결과 영역 압도적 확장.
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Seoul Club Booking Guide — Be a VIP at Gangnam, Hongdae, Itaewon Clubs",
    description:
      "Book Seoul's hottest clubs without speaking Korean. Best VIP tables in Gangnam, Hongdae, Itaewon, Apgujeong. Fair prices, skip the line and the broker.",
    image: ["https://nightflow.kr/og-image.png"],
    datePublished: "2026-01-01T00:00:00+09:00",
    dateModified: new Date().toISOString().split("T")[0] + "T00:00:00+09:00",
    author: {
      "@type": "Organization",
      name: "NightFlow",
      url: "https://nightflow.kr/en",
    },
    publisher: {
      "@type": "Organization",
      name: "NightFlow",
      logo: {
        "@type": "ImageObject",
        url: "https://nightflow.kr/og-image.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": "https://nightflow.kr/en/guide",
    },
    inLanguage: "en-US",
    about: [
      { "@type": "Thing", name: "Seoul Nightlife" },
      { "@type": "Thing", name: "Korea Club Booking" },
      { "@type": "Thing", name: "Gangnam VIP Table" },
      { "@type": "Thing", name: "Hongdae Nightclub" },
      { "@type": "Thing", name: "Itaewon Nightlife" },
    ],
  };

  // Schema.org FAQPage — 외국인 검색 결과에 펼침형 FAQ 노출.
  // Google "Seoul club booking", "Korea nightlife" 검색 시 우리 글이 일반 결과보다 큼.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Do I need to speak Korean to book a Seoul club?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. NightFlow lets foreign travelers book Seoul clubs entirely in English. You plant a flag with your date, group size, and budget, and Seoul clubs send you private VIP offers — no Korean required, no broker.",
        },
      },
      {
        "@type": "Question",
        name: "How much does a Seoul club night cost for foreigners?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Casual entry is ₩20,000–30,000 per person. Main VIP tables in Gangnam start at ₩750,000 (₩150–300K per person split among 4–6). Apgujeong premium lounges start at ₩2,000,000. Through NightFlow you pay the same prices Koreans pay — no tourist tax.",
        },
      },
      {
        "@type": "Question",
        name: "Which Seoul district is best for foreigners?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Itaewon is most foreigner-friendly with English staff and international crowd. Hongdae is best for K-pop and hip-hop fans, walk-in friendly. Gangnam is for luxury VIP table experiences. Apgujeong is for high-end lounges.",
        },
      },
      {
        "@type": "Question",
        name: "How early should I book a Seoul club?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Best 3–7 days before your night. Acceptable 24 hours before. Last resort same day — still works but fewer offers. Friday/Saturday peak nights have the most action.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a booking fee or deposit?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No booking fee, no deposit. Planting a flag on NightFlow is free. You receive offers free. You only pay the club directly when you accept and arrive — at Korean prices, no broker markup.",
        },
      },
      {
        "@type": "Question",
        name: "Can I book a VIP table without Korean MD connections?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Traditional Seoul club booking required Korean MD (promoter) contacts. NightFlow inverts this — clubs and their MDs send you offers. You pick the best one. No connections, no language barrier.",
        },
      },
      {
        "@type": "Question",
        name: "What's the dress code for Seoul clubs?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Gangnam: smart casual minimum — no flip flops, shorts, or ripped jeans. Hongdae: anything goes including streetwear. Itaewon: international smart casual standard. Always bring your passport (Korean ID law).",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* SEO용 sr-only 콘텐츠 — booking 키워드 자연 등장 + Seoul/Gangnam/Hongdae/Itaewon 매칭 강화 */}
      <div className="sr-only">
        <h1>
          Korea Club Booking Guide — Be a VIP at Gangnam, Hongdae, Itaewon
          Clubs (Seoul)
        </h1>
        <p>
          Looking for Seoul club booking that actually works for travelers?
          NightFlow is the Korea club booking platform for foreign visitors —
          Gangnam VIP table booking, Hongdae nightclub booking, Itaewon
          international nightlife. Real prices, no broker, no Korean needed.
          Book Seoul clubs the way regulars do.
        </p>
        <h2>What Korea Club Booking Through NightFlow Looks Like</h2>
        <p>
          Tell us your night — date, party size, budget. Seoul club booking
          offers arrive within hours. Compare Gangnam, Hongdae, Itaewon club
          deals on one screen. Pick your booking and pay the club directly when
          you arrive. Zero booking fee, no broker markup, no deposit.
        </p>
        <h2>Why Book Korea Clubs Here Instead of Walk-In</h2>
        <p>
          Walk-in club booking in Seoul means tourist prices and the worst
          tables. NightFlow Seoul club booking inverts that — top clubs compete
          for your booking, sending private VIP offers only you can see. Real
          locals book this way. Now you can too.
        </p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        {/* Brand */}
        <div className="text-center">
          <span className="text-2xl font-black tracking-tight text-white">
            NightFlow
          </span>
        </div>

        {/* Hero */}
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            Be a VIP at
            <br />
            Seoul&apos;s best clubs
          </h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">
            Seoul club booking made VIP-easy. No connections, no Korean, no
            broker. NightFlow gets you the best tables at Gangnam, Hongdae,
            Itaewon clubs — at fair, upfront prices. Book like a regular from
            your very first night.
          </p>
        </header>

        {/* Pain — the tourist treatment */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">
            Tired of the tourist treatment?
          </h2>
          <div className="space-y-4">
            {PAINS.map((p) => (
              <div
                key={p.title}
                className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800"
              >
                <div className="shrink-0 text-2xl leading-none pt-0.5">
                  {p.icon}
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-neutral-200">
                    {p.title}
                  </p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/en/clubs"
            className="block text-center text-[13px] text-blue-400 underline"
          >
            Browse Seoul clubs with real prices →
          </Link>
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            Skip all this — be the VIP
          </Link>
        </section>

        {/* How it works */}
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-neutral-500 uppercase text-center">
            How Seoul club booking works
          </h2>
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-white text-black font-black flex items-center justify-center">
                  {s.n}
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust — VIP, fair prices */}
        <section className="space-y-4 text-center">
          <h2 className="text-2xl font-black tracking-tight">
            VIP club booking, fair prices
          </h2>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Every booking offer is private — Seoul clubs compete for you on the
            deal, not on who shouts loudest. You see the price upfront and pay
            the club directly. No booking fee, no broker cut. Just the best
            table, the
            way regulars get it.
          </p>
        </section>

        {/* Price tiers — 진짜 가격 + 깃발 예산 유도 */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black tracking-tight">
              Want the full VIP night?
            </h2>
            <p className="text-[14px] text-neutral-400 leading-relaxed">
              Roll in with your friends, spend ₩500,000+, and make the best
              memories of your trip. Here&apos;s what a night out really costs in
              Seoul — no more guessing.
            </p>
          </div>
          <div className="space-y-3">
            {PRICE_TIERS.map((t) => (
              <div
                key={t.label}
                className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800"
              >
                <div className="shrink-0 text-2xl leading-none pt-0.5">
                  {t.icon}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-[15px] text-neutral-200">
                      {t.label}
                    </p>
                    <p className="font-black text-[14px] text-amber-400 whitespace-nowrap">
                      {t.price}
                    </p>
                  </div>
                  <p className="text-[11px] text-neutral-600 tabular-nums">
                    ≈ {krwToAll(t.krwAmount)}
                  </p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">
                    {t.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-neutral-500 leading-relaxed">
            Set your budget — clubs send offers that match.
            The more you bring, the more VIP the night.
          </p>
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            Get VIP offers
          </Link>
        </section>

        {/* Safety tips — collapsible (native details, no JS) */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black tracking-tight text-center">
            Know before you go
          </h2>
          <p className="text-center text-[13px] text-neutral-500 leading-relaxed">
            Seoul nightlife is amazing — but tourists do get scammed. Here&apos;s
            how to stay safe.
          </p>
          <div className="space-y-3">
            {TIPS.map((t) => (
              <details
                key={t.q}
                className="group rounded-2xl bg-[#1C1C1E] border border-neutral-800 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                  <span className="font-bold text-[15px] text-neutral-200">
                    {t.q}
                  </span>
                  <span className="text-neutral-500 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="px-5 pb-5 space-y-2">
                  {t.items.map((it, i) => (
                    <p
                      key={i}
                      className="text-[13px] text-neutral-400 leading-relaxed"
                    >
                      • {it}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <p className="text-center text-[13px] text-neutral-500 leading-relaxed">
            Or skip all the risk — NightFlow is the verified channel. Real
            clubs, upfront prices, no touts.
          </p>
        </section>

        {/* CTA */}
        <section className="space-y-3 pt-2">
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            Get VIP access — sign up free
          </Link>
          <p className="text-[12px] text-neutral-600 text-center leading-relaxed">
            19+ only · Bring your passport to the venue.
            <br />
            Make the night more beautiful.
          </p>
        </section>
      </div>
    </div>
  );
}
